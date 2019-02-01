'use strict';

// node and npm modules
const moment = require('moment');
const dir = require('node-dir');
const fs = require('mz/fs');
const path = require('path');
const escomplex = require('escomplex');

// user defined modules
const { Client } = require('./client.js');
const { Clone } = require('./clone.js');
const utils = require('./utils.js');

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

    //TODO: this method needs to be restructured
    /**
     *  A summary of a file extension
     *  @typedef {object} ExtensionSummary
     *  @property {number} numberOfFiles - The number of files with that extension
     *  @property {number} numberOfLines - The lines of code with that extension
     */

    /**
     *  Get number of lines of code and number of files by extension.
     *  @param {Object} [options] - The options
     *  @param {Array<string>} [options.excludedDirs=['.git']]
     *      A list of directories to be excluded. Only '.git' by default.
     *  @param {Array<string>} [options.excludedExts=[]]
     *      A list of extensions to be excluded.
     *
     *  @return {Object<string, ExtensionSummary>}
     *      An object with file extensions as keys and an object with
     *      lines of code and number of files as value.
     */
    getStaticAnalysis({
            excludedDirs = ['.git'],
            excludedExts = []} = {}) { //TODO: consider changing to includedExts to avoid processing unknown/non-text types

        // Perform preliminary analysis and prepare JSON tree for further processing
        function buildFileDetails (fileDetails, file) {
            const numberOfLines = file.contents.split('\n').length;

            // if the file extension key exists, add to existing key
            if (fileDetails[file.ext]) {
                fileDetails[file.ext].numberOfFiles += 1;
                fileDetails[file.ext].numberOfLines += numberOfLines;
                fileDetails[file.ext].files.push(file.path);
            // otherwise, create a new key
            } else {
                fileDetails[file.ext] = {
                    numberOfFiles: 1,
                    numberOfLines: numberOfLines,
                    files: [file.path]
                };
            }

            // TODO: move this functionality elsewhere
            switch (file.ext) {
                case '.js':
                    // Count lines of code
                    // TODO: separate to a function

                    /*
                        The following regular expression is designed to capture comments in Javascript.

                        Non-capturing group 1: matches all string literals, including multi-line strings.  This is
                        necessary to prevent falsely matching string literals as comments.  Contains capture group 1
                        which captures the type of quote used, necessary for backreferencing.

                        Non-capturing group 2: matches regular expressions.  This is necessary to prevent
                        falsely matching non-escaped quotes or slashes as strings or comments.

                        Capture group 2: block comments

                        Capture group 3: line comments
                     */
                    let commentPattern = /(?:(?<!\\)("|'|`)[\s\S]*?(?<!\\)\1)|(?:\/(?!\*)[^\r\n\f]+(?<!\\)\/)|(\/\*[\s\S]*?\*\/)|(\/\/[^\r\n\f]*)/g;
                    let commentLines = 0;
                    let match;

                    while(match = commentPattern.exec(file.contents)) {
                        // Group 2 = block comments
                        if (match[2]) {
                            // TODO: consider quantifying comments by bytes as opposed to lines?
                            commentLines += match[2].split('\n').length;
                        }
                        // Group 3 = line comments
                        if (match[3]) {
                            commentLines++;
                        }
                    }

                    if (fileDetails[file.ext].numberOfCommentLines) {
                        fileDetails[file.ext].numberOfCommentLines += commentLines;
                    } else {
                        fileDetails[file.ext].numberOfCommentLines = commentLines;
                    }

                    break;
                case '.py':
                    // TODO
                    break;
                default:
                    // TODO: add non-code analyses if necessary (documentation?)
                    break;
            }

            return fileDetails;
        }

        // Process fully formed file details object
        // TODO: external python analysis, review aggregated escomplex analysis
        async function processFiles(fileDetails) {
            // JS static analysis
            if (fileDetails['.js']) {
                let source = [];

                for (let file of fileDetails['.js'].files) {
                    let code = await fs.readFile(file, 'utf8');

                    source.push({
                        path: file,
                        code: code
                    });
                }

                let escomplexReport = escomplex.analyse(source, {});

                // TODO: review aggregated results, add/remove metrics as necessary
                fileDetails['.js'].staticAnalysis = {
                    cyclomatic: escomplexReport.cyclomatic,
                    effort: escomplexReport.effort,
                    maintainability: escomplexReport.maintainability,
                    changeCost: escomplexReport.changeCost
                };
            }

            return fileDetails;
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
            // map files to extension and contents of each file
            // QUESTION: In this case, does async/await mean the function
            //           will wait for each file to be read? or not?
            // TODO: revisit? possibly parallelize?
            .then(({files}) => files.map(async (file) => ({
                path: file,
                name: path.basename(file),
                ext: path.extname(file),
                contents:  await fs.readFile(file, 'utf8')})))
            // wait until all files have been read
            .then(readPromises => Promise.all(readPromises))
            // accumulate metrics into one object
            .then(files => files.reduce(buildFileDetails, {}))
            .then(fileDetails => processFiles(fileDetails));
    }
}

module.exports = {
    Data: Data
};