'use strict';

// node and npm modules
const moment = require('moment');
const dir = require('node-dir');
const path = require('path');

// user defined modules
const { Client } = require('./client.js');
const { Clone } = require('./clone.js');
const utils = require('./utils.js');
const analyse = require('./analyse.js');
const mkLogger = require('./log.js');

const { makeDB } = require('./database.js');

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
        this.client = new Client(options.auth_token);
        // If `noClone` option is specified, don't clone the repository
        // Useful to get metrics only depending on the GitHub API
        // without waiting for the repository to clone
        this.clonePromise = options.noClone ? undefined : Clone.init(url);
        this.owner = owner;
        this.repoName = name;

        // promise to a database wrapper
        this._db = makeDB('hubdata.sqlite3');
    }

    async getMetaAnalysis(commits = []) {
        const unalignedIssues = await this.getAllIssues();
        const issues = utils.alignIssuesToCommits(unalignedIssues, commits);

        return issues;
    }

    /**
     *  Get all the issues in the project
     *
     *  @param {number} [pageSize=100] - The number of issues per page
     *
     *  @return {Array<IssueInfo2>}
     */
    async getAllIssues(pageSize = 100) {
        // create query to query first `pageSize` issues after cursor
        // or first `pageSize` issues if no cursor is provided
        const issuesQuery = cursor => `
            query repo {
                repository(name: "${this.repoName}", owner: "${this.owner}") {
                    issues (
                            first: ${pageSize}, ` + (cursor ? `after: "${cursor}", ` : '') + `
                            orderBy: {field:CREATED_AT, direction:ASC}) {
                        edges {
                            cursor
                            node {
                                state
                                createdAt
                                closedAt
                            }
                        }
                    }
                }
        }`;

        let results = [];
        let cursor = null;

        // keep getting issues until there are less than a `pageSize`'s worth of issues
        while (true) {
            // query GitHub
            const edges = await this.client.query(issuesQuery(cursor), {})
                // unwrap data, if no issues, return []
                .then(body => body.data ? body.data.repository.issues.edges : []);

            // get cursor of last issues
            cursor = edges[edges.length - 1].cursor;
            // unwrap issue nodes
            const issues = edges
                .map(e => e.node)
                // convert date strings to Date objects
                .map(i => ({
                    state: i.state,
                    createdAt: new Date(i.createdAt),
                    // closed date might be null, propagate null
                    closedAt: i.closedAt ? new Date(i.closedAt) : null,
                }));

            results.push(...issues);
            // check if should continue
            if (edges.length < pageSize)
                break;
        }

        return results;
    }

    /**
     *  Get number of stargazers of the project
     *
     *  @return {number} The number of stargazers
     */
    getNumberOfStargazers() {
        const query = `
            query repo{
                repository(name: "${this.repoName}", owner: "${this.owner}"){
                    stargazers {
                        totalCount
                    }
                }
            }`;
        return this.client.query(query, {})
            .then(body => body.data.repository)
            .then(repo => repo.stargazers.totalCount);
    }

    /**
     *  Get number of pull requests of the project
     *
     *  @return {number} The number of pull requests
     */
    getNumberOfPullRequests() {
        const query = `
            query repo{
                repository(name: "${this.repoName}", owner: "${this.owner}"){
                    pullRequests {
                        totalCount
                    }
                }
            }`;
        return this.client.query(query, {})
            .then(body => body.data.repository)
            .then(repo => repo.pullRequests.totalCount);
    }

    /**
     *  Get total number of commits in Master branch
     *
     *  @return {number} The number of commits
     */
    getNumberOfCommitsInMaster() {
        const query = `
            query repo{
                repository(name: "${this.repoName}", owner: "${this.owner}"){
                    ref(qualifiedName: "master") {
                        target {
                            ... on Commit {
                                history {
                                    totalCount
                                }
                            }
                        }
                    }
                }
            }`;
        return this.client.query(query, {})
            .then(body => body.data.repository)
            .then(repo => repo.ref.target.history.totalCount);
    }

    /**
     *  Count of commits in period
     *  @typedef {object} CommitPeriodCount
     *  @property {Date} start - The start of the counting period
     *  @property {Date} end - The end of the counting period
     *  @property {number} count - The number of commits in the period
     */

    /**
     *  Get total number of commits in Master branch in each time period
     *  @param {Date} [startTime=moment().subtract(6, 'months')]
     *      The start of the sampling period
     *  @param {object} [timeDelta={days: 7}]
     *      The timedelta of each period, see [reference]{@link https://momentjs.com/docs/#/manipulating/add/}
     *
     *  @return {Array<CommitPeriodCount>}
     *      The number of commits in each period
     */
    getNumberOfCommitsByTime(
            startTime = moment().subtract(6, 'months'),
            timeDelta = {days: 7}) {
        const query = `
            query repo ($start: GitTimestamp!, $end: GitTimestamp!) {
                repository(name: "${this.repoName}", owner: "${this.owner}"){
                    ref(qualifiedName: "master") {
                        target {
                            ... on Commit {
                                history (since: $start, until: $end) {
                                    totalCount
                                }
                            }
                        }
                    }
                }
            }`;
        const now = moment();

        // Set up initial arrays
        let queries = [];
        let startTimes = [];
        let endTimes = [];

        // Get the time stamps used to sample the project
        // WARNING: moment().add(...) is in place!
        const times = utils.gen(
                startTime.clone(),
                t => t.clone().add(timeDelta),
                t => !t.isBefore(now)
            );

        // Create queries to sample the periods in between the time stamps
        for (const [start, end] of utils.pairs(times)) {
            startTimes.push(start.toDate());
            endTimes.push(end.toDate());
            queries.push(
                this.client.query(
                    query, {
                        start: start.toISOString(),
                        end: end.toISOString()
                    }));
        }

        return Promise.all(queries)
            .then(Qs => Qs.map(body => body.data.repository))
            .then(repos => repos.map(repo => repo.ref.target.history.totalCount))
            // Zip the query results with the start and end times for the periods
            .then(commitsByWeek => utils.zip(startTimes, endTimes, commitsByWeek))
            // Transform results into objects
            .then(datetimeCountTuples => datetimeCountTuples.map(
                tuple => ({start: tuple[0], end: tuple[1], count: tuple[2]})));
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

        // get last commit in database
        const lastCommit = repo_id.then(id => db.get.lastCommit(id))
            // convert date to Date object
            // if there are none, return `null`
            .then(({commit_id, commit_date} = {}) => (commit_id ? {
                commit_id: commit_id,
                commit_date: new Date(commit_date),
            } : null));

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
            .then(commits => this.getMetaAnalysis(commits));

        // begin static analysis of new commits when ready
        const newStatic = Promise.all([this.clonePromise, newCommits])
            .then(([clone, newCommits]) => 
                clone.foreachCommit(newCommits,
                    async (commit, index) => ({
                        commit_id: commit.id().tostrS(),
                        commit_date: commit.date(),
                        // have to wait for analysis to finish before
                        // checking out next commit
                        valuesByExt: await this.getStaticAnalysis(),
            })));


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

        const points = utils.rows2points(results);

        return points;
    }
}

module.exports = {
    Data: Data
};