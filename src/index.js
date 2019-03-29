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

    // get new commits
    const newCommits = Promise.all([data.clonePromise, lastCommit])
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
            return commits;
        });

    // begin static analysis of new commits when ready
    const newAnalyses = Promise.all([data.clonePromise, newCommits, repo_id])
        .then(async ([clone, newCommits, repo_id]) => {
            const analyses = await clone.foreachCommit(newCommits,
                async (commit, index) => ({
                    commit_id: commit.id().tostrS(),
                    commit_date: commit.date(),
                    // have to wait for analysis to finish before
                    // checking out next commit
                    valuesByExt: await data.getStaticAnalysis(),
            }));

            // new analyses is a list of objects
            // with keys: commit_id, commit_date, and valuesByExt
            // where valuesByExt is an object with different file extensions as keys
            // and objects of metric types as keys and metric values as values

            let results = [];
            // convert it into a flat list of objects
            // where each object key corresponds to a column in the table MetricValues
            for (const {commit_id, commit_date, valuesByExt} of analyses) {
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
                    }
                }
            }

            return results;
        });

    // insert new analysis results into database
    newAnalyses.then(analyses => db.safeInsert.values(analyses))
        .then(_ => logger.debug('Finished inserting values to database'));

    // get already analysed commits if present, otherwise empty list
    const oldAnalyses = Promise.all([repo_id, lastCommit])
        .then(([repo_id, lastCommit]) => lastCommit ? db.get.valuesUntil({
            repo_id: repo_id,
            end_date: lastCommit.commit_date,
        }) : []);
    
    // merge new and old analyses
    const results = await Promise.all([oldAnalyses, newAnalyses])
        .then(([oldAnalyses, newAnalyses]) => {
            // old analyses serves as the start for our results
            // after we can append the new results to it
            let results = [...oldAnalyses, ...newAnalyses];

            console.log(`# of old results: ${oldAnalyses.length}`);


            console.log(`# of new results: ${newAnalyses.length}`);
            return results;
        });

    const end = Date.now();
    logger.info(`time elapsed: ${Math.round((end - start) / 1000)}s`);
    res.send({
        points: utils.rows2points(results),
    });
});

app.listen(port, () => console.log(`listening on ${port}`));