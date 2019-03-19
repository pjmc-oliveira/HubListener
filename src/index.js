const express = require('express');

const { Data } = require('./data.js');
const { makeDB } = require('./database.js');
const mkLogger = require('./log.js');
const utils = require('./utils.js');

const app = express();
const port = 8080;
const logger = mkLogger({label: __filename, level: 'info'});
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

/**
 * API endpoint tp run the analysis on the given GitHub project URL.
 * Parses JSON input.
 * 
 * @param {string} url - the GitHub URL to analyse
 * @param {object} options - the analysis options
 * 
 * @return {object}
 *      the object containing the metrics
 */
app.post('/analyse', async (req, res) => {
    logger.info('[POST] request to /analyse');
    // wait for our db to load
    const db = await _db;

    // parse url from body
    const { url, options } = req.body;
    const { owner, name } = utils.parseURL(url);

    // ensure repo is in database
    const repo_id = db.get.repo({owner, name})
        // if repo not present, insert it
        .then(repo => repo ?
            repo :
            db.insert.repo({owner, name}))
        .then(rowOrInfo => rowOrInfo.id !== undefined ?
            // return the id of the already present repo
            rowOrInfo.id :
            // or the last id of the table after it's inserted
            rowOrInfo.lastID);

    // begin clone and update local copy of repository
    const data = new Data(url, options);
    // begin static analysis when ready
    const analyses = data.clonePromise.then(async clone => {
        const commits = (await clone.headCommitHistory()).reverse();
        return clone.foreachCommit(commits,
            async (commit, index) => ({
                commit_id: commit.id().tostrS(),
                commit_date: commit.date(),
                // have to wait for analysis to finish before
                // checking out next commit
                valuesByExt: await data.getStaticAnalysis()
            }));
    });
    // const analysis = data.clonePromise.then(_ => data.getStaticAnalysis());

    // wait for repo to be cloned, analysis to be completed, and repo to be added to DB
    const results = await Promise.all([data.clonePromise, analyses, repo_id])
        // add analysis values to database
        .then(async ([clone, analyses, repo_id]) => {
            // insert analysis values into database
            db.safeInsert.values(repo_id, analyses);
            return analyses;
    });

    res.send({data: results});
});

app.listen(port, () => console.log(`listening on ${port}`));