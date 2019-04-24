'use strict';

// node and npm modules
const moment = require('moment');
const dir = require('node-dir');
const path = require('path');

// user defined modules
const { Client } = require('./client.js');
const { Clone } = require('./clone.js');
const { parallelAnalysis } = require('./parallel.js');
const utils = require('./utils.js');
const mkLogger = require('./log.js');
const logger = mkLogger({label: __filename});


/**
 *  @class The Data class is used as the central point where all raw
 *  data is fetched from. It holds a client connection to the GitHub project
 *  and a cloned instance of the Git repository.
 */
class Data {
    static async init(url, db, options) {
        const clone = await Clone.init(url);
        return new Data({
            url,
            db: await db,
            clone,
            options,
        });
    }

    /**
     *  Construct a {@link Data} object, create a [clone]{@link Clone} from the
     *  Git repository asynchronously, and initialize
     *  [GitHub API]{@link https://developer.github.com/v4/} [client]{@link Client}
     *
     *  @param {string} url - GitHub project URL
     *  @param {object} options - Configuration arguments
     *  @param {string} options.auth_token - The GitHub authentication token
     *  @param {boolean} options.noClone - Flag on whether to clone the Git project or not
     */
    constructor({url, db, clone, options} = {}) {
        // Parse the GitHub URL into project owner and project name
        const {owner, name} = utils.parseURL(url);
        this.client = new Client({
            owner,
            name,
            auth_token: (options || {}).auth_token,
        });
        this.clone = clone
        this.owner = owner;
        this.name = name;
        this.db = db;
    }

    async analyse() {
        // ensure repo is in database
        const repo_id = await this.db.getRepoId({
            owner: this.owner, 
            name: this.name
        });

        // get last commit in database
        const lastCommit = await this.db.getLastCommit(repo_id);

        // get new commits 
        const newCommits = await this.clone.commitsAfter(lastCommit ? lastCommit.commit_date : null);

        // get the meta analysis for project
        const newMeta = this.client.getMetaAnalysis(
            newCommits.map(c => ({
                commit_id: c.id().tostrS(),
                commit_date: c.date(),
            }))
        );

        // begin static analysis of new commits
        // analyse in parallel if many commits
        const newStatic = newCommits.length < 10 ?
            this.clone.analyseCommits({commits: newCommits}) :
            parallelAnalysis(this, newCommits.map(c => c.id().tostrS()));

        // merge static and meta analysis
        const newAnalyses = Promise.all([newStatic, newMeta])
            .then(([static_, meta]) => {
                // new analyses is a list of objects
                // with keys: commit_id, commit_date, and valuesByExt
                // where valuesByExt is an object with different file extensions as keys
                // and objects of metric types as keys and metric values as values

                let results = [];

                // convert it into a flat list of objects
                // where each object key corresponds to a column in the table MetricValues
                for (const {commit_id, commit_date, valuesByExt} of static_) {
                    for (const [ext, staticValues] of Object.entries(valuesByExt)) {

                        // merge metrics
                        const metricValues = {...staticValues, ...meta[commit_id]};
                        
                        // expand into separate rows
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
        newAnalyses.then(values => this.db.insertValues(values))
            .then(() => logger.debug('Finished inserting values to database'));

        // get already analysed commits if present, otherwise empty list
        const oldAnalyses = this.db.getValuesUntil(repo_id, lastCommit);

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

        const points = utils.rows2points(results);

        return points;
    }
}

module.exports = {
    Data: Data
};