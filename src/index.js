const express = require('express');
const app = express();
const port = 8080;
const {Data} = require('./data');

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

app.listen(port, () => console.log(`listening on ${port}`));