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
    }

    /**
     *  The number of issues in total and by state
     *  @typedef {object} IssuesCount
     *  @property {number} total - The total number of issues
     *  @property {number} open - The number of open issues
     *  @property {number} closed - The number of closed issues
     */

    /**
     *  Get total the number of issues, as well as number of issues OPEN and CLOSED.
     *
     *  @return {Promise<IssuesCount>}
     *      The number of issues
     */
    getNumberOfIssues() {
        const query = `
            query repo{
                repository(name: "${this.repoName}", owner: "${this.owner}"){
                    total: issues {
                        totalCount
                    }
                    open: issues (states: [OPEN]) {
                        totalCount
                    }
                    closed: issues (states: [CLOSED]) {
                        totalCount
                    }
                }
            }`;
        return this.client.query(query, {})
            .then(body => body.data.repository)
            // Unwrap the data
            .then(repo => utils.unwrap(repo, 'totalCount'));
    }

    /**
     *  The information of issues per state
     *  @typedef {object} IssuesInfo
     *
     *  @property {Array<object>} total - The information for all the issues
     *  @property {string} total.state - The state of each issue (i.e. OPEN, CLOSED)
     *  @property {Date} total.cratedAt - The date and time each issue was created
     *
     *  @property {Array<object>} open - The information for open issues
     *  @property {Date} open.cratedAt - The date and time each issue was created
     *
     *  @property {Array<object>} closed - The information for closed issues
     *  @property {Array<Date>} closed.createdAt - The date and time each issue was created
     *  @property {Array<Date>} closed.closedAt - The date and time each issue was closed
     */

    /**
     *  Get details from the first N issues of each kind (any/open/closed)
     *  @param {IssuesCount} numberOfIssues - The number of issues per state
     *
     *  @return {Promise<IssuesInfo>} The information for the issues
     */
    getIssuesInfo({total, open, closed} = {}) {
        const query = `
            query repo{
                repository(name: "${this.repoName}", owner: "${this.owner}"){
                    total: issues (
                            first: ${total},
                            orderBy: {field:CREATED_AT, direction:ASC}) {
                        nodes {
                            state
                            createdAt
                        }
                    }
                    open: issues (
                            states: [OPEN],
                            first: ${open},
                            orderBy: {field:CREATED_AT, direction:ASC}) {
                        nodes {
                            createdAt
                        }
                    }
                    closed: issues (
                            states: [CLOSED],
                            first: ${closed},
                            orderBy: {field:CREATED_AT, direction:ASC}) {
                        nodes {
                            createdAt
                            closedAt
                        }
                    }
                }
            }`;

        return this.client.query(query, {})
            .then(body => body.data.repository)
            .then(
                repo => ({
                    total: repo.total.nodes.map(n => ({
                        state: n.state,
                        // Parse the dates from strings
                        createdAt: Date.parse(n.createdAt)
                    })),
                    open: repo.open.nodes.map(n => ({
                        createdAt: Date.parse(n.createdAt)
                    })),
                    closed: repo.closed.nodes.map(n => ({
                        createdAt: Date.parse(n.createdAt),
                        closedAt: Date.parse(n.closedAt)
                    }))
                })
            );
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
}

module.exports = {
    Data: Data
};