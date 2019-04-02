'use strict';

// node and npm modules
const dir = require('node-dir');
const path = require('path');

// user defined modules
const { Client } = require('./client.js');
const { Clone } = require('./clone.js');
const utils = require('./utils.js');
const analyse = require('./analyse.js');
const mkLogger = require('./log.js');

const { Database } = require('./database.js');

const logger = mkLogger({label: __filename});

/**
 *  @class The Data class is used as the central point where all raw
 *  data is fetched from. It holds a client connection to the GitHub project
 *  and a cloned instance of the Git repository.
 */
class Data {
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
    constructor(url, options = {}) {
        // Parse the GitHub URL into project owner and project name
        const {owner, name} = utils.parseURL(url);
        this.client = new Client({
            owner,
            name,
            auth_token: options.auth_token,
        });
        // If `noClone` option is specified, don't clone the repository
        // Useful to get metrics only depending on the GitHub API
        // without waiting for the repository to clone
        this.clonePromise = options.noClone ? undefined : Clone.init(url);
        this.owner = owner;
        this.repoName = name;

        // promise to a database wrapper
        this._db = Database.init('hubdata.sqlite3');
    }

    /**
     *  A summary of a file extension
     *  @typedef {object} ExtensionSummary
     *  @property {number} numberOfFiles - The number of files with that extension
     *  @property {number} numberOfLines - The lines of code with that extension
     */

    /**
     *  Performs static analysis of code on disk and returns a report of the results.
     *  @param {Object} [options] - The options
     *  @param {Array<string>} [options.excludedDirs=['.git']]
     *      A list of directories to be excluded. Only '.git' by default.
     *  @param {Array<string>} [options.excludedExts=[]]
     *      A list of extensions to be excluded.
     *
     *  @return {Object<string, ExtensionSummary>}
     *      An object with file extensions as keys and an object with
     *      all static analyses results as the value.
     */
    getStaticAnalysis({
            excludedDirs = ['.git'],
            excludedExts = []} = {}) {

        // Build a map of file extensions to file paths
        function buildFileDetails (fileDetails, file) {

            // if the file extension key exists, add to existing key
            if (fileDetails[file.ext]) {
                fileDetails[file.ext].files.push(file.path);
            // otherwise, create a new key
            } else {
                fileDetails[file.ext] = {
                    files: [file.path]
                };
            }

            return fileDetails;
        }

        // Process fully formed file details object
        async function processFiles(fileDetails) {
            let output = {};

            for (let ext in fileDetails) {
                switch (ext) {
                    case '.js':
                        let jsReport = await analyse.javascript(fileDetails[ext].files);
                        output[ext] = jsReport;
                        break;
                    case '.py':
                        let pyReport = await analyse.python(fileDetails[ext].files);
                        output[ext] = pyReport;
                        break;
                    default:
                        let report = await analyse.generic(fileDetails[ext].files);
                        output[ext] = report;
                        break;
                }
            }

            return output;
        }

        // Returns true if the file path is in an excluded directory,
        // otherwise false
        function isInExcludedDir(relativePath) {
            for (const excludedDir of excludedDirs) {
                if (relativePath.startsWith(excludedDir)) {
                    return true;
                }
            }
            return false;
        }

        // Returns true if the file name has an excluded extension,
        // otherwise false
        function hasExcludedExt(relativePath) {
            for (const excludedExt of excludedExts) {
                if (relativePath.endsWith(excludedExt)) {
                    return true;
                }
            }
            return false;
        }

        return this.clonePromise
            // get information from clone paths
            .then(async (clone) => ({
                repoPath: clone.path,
                files: await dir.promiseFiles(clone.path)}))
            // filter out excluded directories, if there are any
            .then(filesInfo => (excludedDirs.length ? {
                repoPath: filesInfo.repoPath,
                files: filesInfo.files.filter(file => !isInExcludedDir(file.slice(filesInfo.repoPath.length + 1)))
            } : filesInfo))
            // filter out excluded extensions, if there are any
            .then(filesInfo => (excludedExts.length ? {
                repoPath: filesInfo.repoPath,
                files: filesInfo.files.filter(file => !hasExcludedExt(file.slice(filesInfo.repoPath.length + 1)))
            } : filesInfo))
            // map absolute file paths to a convenience object containing the path, basename and extension
            .then(({files}) => files.map(file => ({
                path: file,
                name: path.basename(file),
                ext: path.extname(file)})))
            // accumulate metrics into one object
            .then(files => files.reduce(buildFileDetails, {}))
            .then(fileDetails => processFiles(fileDetails));
    }

    async analyse() {
        // wait for our db to load
        const db = await this._db;

        const owner = this.owner;
        const name = this.repoName;

        // ensure repo is in database
        const repo_id = db.getRepoId({owner, name});

        // get last commit in database
        const lastCommit = repo_id.then(id => db.getLastCommit(id));

        // begin static analysis of new commits when ready
        const newCommits = Promise.all([this.clonePromise, lastCommit])
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

        // get the meta analysis for project
        const newMeta = newCommits
            .then(commits => commits.map(c => ({
                commit_id: c.id().tostrS(),
                commit_date: c.date(),
            })))
            .then(commits => this.client.getMetaAnalysis(commits));

        // begin static analysis of new commits when ready
        const newStatic = Promise.all([this.clonePromise, newCommits])
            .then(([clone, newCommits]) => 
                clone.foreachCommit(newCommits,
                    async (commit, index) => {
                        if (index % 10 === 0)
                            console.log(`Analysing (${index}/${newCommits.length})`);
                        return {
                            commit_id: commit.id().tostrS(),
                            commit_date: commit.date(),
                            // have to wait for analysis to finish before
                            // checking out next commit
                            valuesByExt: await this.getStaticAnalysis(),
                    };
                }
            ));


        // merge static and meta analysis
        const newAnalyses = Promise.all([newStatic, newMeta, repo_id])
            .then(([static_, meta, repo_id]) => {

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
        newAnalyses.then(values => db.insertValues(values))
            .then(_ => logger.debug('Finished inserting values to database'));

        // get already analysed commits if present, otherwise empty list
        const oldAnalyses = Promise.all([repo_id, lastCommit])
            .then(([id, commit]) => db.getValuesUntil(id, commit));

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