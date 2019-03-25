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
    // disable request timeout...
    req.setTimeout(0);
    logger.info('[POST] request to /analyse');

    const start = Date.now();

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

    // get last commit in database
    const lastCommit = repo_id.then(id => db.get.lastCommit(id))
        // convert date to Date object
        // if there are none, return `null`
        .then(({commit_id, commit_date} = {}) => (commit_id ? {
            commit_id: commit_id,
            commit_date: new Date(commit_date),
        } : null));

    // begin static analysis of new commits when ready
    const newAnalyses = Promise.all([data.clonePromise, lastCommit])
        .then(async ([clone, lastCommit]) => {
            // get all commits
            const allCommits = (await clone.headCommitHistory());
            // function to determine if commit is new
            const isNew = commit => commit.date() > lastCommit.commit_date;
            // if there is a last commit,
            // only keep new commits, otherwise keep all
            const commits = (lastCommit ?
                (allCommits.filter(isNew)) :
                allCommits)
                // reverse into chronological order
                .reverse();

            return clone.foreachCommit(commits,
                async (commit, index) => ({
                    commit_id: commit.id().tostrS(),
                    commit_date: commit.date(),
                    // have to wait for analysis to finish before
                    // checking out next commit
                    valuesByExt: await data.getStaticAnalysis()
            }));
    });

    // insert new analysis results into database
    Promise.all([newAnalyses, repo_id])
        .then(([analyses, repo_id]) => db.safeInsert.values(repo_id, analyses));

    // get already analysed commits if present, otherwise empty list
    const oldAnalyses = Promise.all([repo_id, lastCommit])
        .then(([repo_id, lastCommit]) => lastCommit ? db.get.valuesUntil({
            repo_id: repo_id,
            end_date: lastCommit.commit_date,
        }) : []);
    
    // merge new and old analyses
    const results = await Promise.all([newAnalyses, oldAnalyses, repo_id])
        .then(([newAnalyses, oldAnalyses, repo_id]) => {
            // old analyses serves as the start for our results
            // after we can append the new results to it
            let results = oldAnalyses;

            console.log(`# of old results: ${oldAnalyses.length}`);

            // new analyses is a list of objects
            // with keys: commit_id, commit_date, and valuesByExt
            // where valuesByExt is an object with different file extensions as keys
            // and objects of metric types as keys and metric values as values
            
            let count = 0;

            // convert it into a flat list of objects
            // where each object key corresponds to a column in the table MetricValues
            for (const {commit_id, commit_date, valuesByExt} of newAnalyses) {
                for (const [ext, metricValues] of Object.entries(valuesByExt)) {
                    for (const [type, value] of Object.entries(metricValues)) {
                        // convert date string into UNIX timestamp
                        const timestamp = Date.parse(commit_date);
                        results.push({
                            repo_id: repo_id,
                            commit_id: commit_id,
                            commit_date: timestamp,
                            file_extension: ext,
                            metric_type: type,
                            metric_value: value,
                        });
                        count++;
                    }
                }
            }

            console.log(`# of new results: ${count}`);
            return results;
        });

    const end = Date.now();
    logger.info(`time elapsed: ${Math.round((end - start) / 1000)}s`);
    res.send({data: results});
});

app.listen(port, () => console.log(`listening on ${port}`));