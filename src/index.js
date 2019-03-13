const express = require('express');

const { Data } = require('./data.js');
const { makeDB } = require('./database.js');
const utils = require('./utils.js');

const app = express();
const port = 8080;
// promise to a database wrapper
const _db = makeDB('hubdata.sqlite3');

app.use(express.static('static'));
app.use(express.json());

/**
 * Runs HubListener metrics gathering.
 *
 * @param {string} url - a GitHub url for the repo to be analyzed
 * @param {Object} options - The options
 *
 * @return {Object}
 *      An object containing all project analysis broken down by commits.
 */
app.post('/run', (req, res) => {
    const { url, options } = req.body;

    const data = new Data(url, options);

    // TODO: should not run for EVERY commit - define through options
    data.clonePromise.then(async (clone) => {
        console.log(clone.path);
        const commits = (await clone.headCommitHistory()).reverse();
        const results = await clone.foreachCommit(commits,
            async (commit, index) => ({
                commit: commit.id().tostrS(),
                author: commit.author().toString(),
                index: index,
                date: commit.date().toISOString(),
                analysis: await data.getStaticAnalysis()}),
            (commit, error, index) => ({
                commit: commit.id().tostrS(),
                author: commit.author().toString(),
                index: index,
                date: commit.date().toISOString(),
                error: error
            }));

        res.send(results);
    });
});

app.post('/analyse', async (req, res) => {
    // wait for our db to load
    const db = await _db;

    // parse url from body
    const { url, options } = req.body;
    const { owner, name } = utils.parseURL(url);

    // ensure repo is in database
    const repoId = db.get.repo({owner, name})
        // if repo not present, insert it
        .then(repo => repo ?
            repo :
            db.insert.repo({owner, name}))
        .then(rowOrInfo => rowOrInfo.id !== undefined ?
            // return the id of the already present repo
            rowOrInfo.id :
            // or the last id of the table after it's inserted
            rowOrInfo.lastID);

    // clone and update repo
    const data = new Data(url, options);

    // wait for both
    const results = Promise.all([data.clonePromise, repoId]).then(async ([clone, info]) => {
        console.log('in promise...');
        console.log(info);
        return {};
    });

    res.send({data: await results});
});

app.listen(port, () => console.log(`listening on ${port}`));