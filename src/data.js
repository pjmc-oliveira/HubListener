'use strict';

const moment = require('moment');
const dir = require('node-dir');
const fs = require('mz/fs');
const path = require('path');

const { Client } = require('./client.js');
const { Clone } = require('./clone.js');
const utils = require('./utils.js');

/**
 * @class {Data} Data class specification
 */
module.exports.Data = class Data {
    /**
     *  Construct a {Data} object, create a clone from the
     *  GitHub project asynchronously, and initialize API
     *  @param {string} GitHub repository URL
     *  @param {{auth_token: {string}}} Provide optional arguments
     */
    constructor(url, options = {}) {
        const {owner, name} = utils.parseURL(url);
        this.client = new Client(options.auth_token);
        this.clonePromise = options.noClone ? undefined : Clone.init(url);
        this.owner = owner;
        this.repoName = name;
    }

    /**
     *  Get total the *number* of issues, as well as OPEN and CLOSED
     *
     *  @return {Promise({total: number, open: number, closed: number})}
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
            .then(
                repo => ({
                    total: repo.total.totalCount,
                    open: repo.open.totalCount,
                    closed: repo.closed.totalCount,
                })
            );
    }

    /**
     *  Get details from the first N issues of each kind (any/open/closed)
     *  @param {{
     *      total:  number,
     *      open:   number,
     *      closed: number,
     *  }}
     *      The first N issues to get by kind
     *
     *  @return {Promise({
     *      total: {state: [string], createdAt: [Date]},
     *      open: {createdAt: [Date]},
     *      closed: {createdAt: [Date], closedAt: [Date]}
     *  })}
     *      The info for the issues
     */
    getIssuesInfo({total, open, closed} = {}) {
        // TODO: better guards or optional args
        const assert = require('assert');
        assert(total !== undefined, 'total must be defined!');
        assert(open !== undefined, 'open must be defined!');
        assert(closed !== undefined, 'closed must be defined!');

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
            )

    }

    /**
     *  Get number of stargazers of project
     *
     *  @return {{total: number}}
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
            .then(repo => ({total: repo.stargazers.totalCount}));
    }

    /**
     *  Get number of pull requests of project
     *
     *  @return {{total: number}}
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
            .then(repo => ({total: repo.pullRequests.totalCount}));
    }

    /**
     *  Get total number of commits in Master
     *
     *  @return {{total: number}}
     */
    getNumberOfCommits() {
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
            .then(repo => ({total: repo.ref.target.history.totalCount}));
    }

    /**
     *  Get total number of commits in Master in each timeDelta
     *  @param {Date} the start of the sampling period
     *  @param {object} the timedelta of each period
     *
     *  @return {object}
     *      an object where each key is a ISO 8601 string of the date of the start of
     *      the sampling period, and the key is the number of commits in the period.
     */
    getNumberOfCommitsByTime(
            startTime = moment().subtract(6, 'months'),
            timeDelta = {days: 7}) {
        const start = moment(startTime);
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
        var queries = [];
        var startTimes = []
        // WARNING: moment().add(...) is in place!
        while (start.isBefore(moment())) {
            startTimes.push(start.toISOString());
            queries.push(
                this.client.query(
                    query, {
                        start: start.toISOString(),
                        end: start.add(timeDelta).toISOString()}))
        }

        return Promise.all(queries)
            .then(Qs => Qs.map(body => body.data.repository))
            .then(repos => repos.map(repo => repo.ref.target.history.totalCount))
            .then(commitsByWeek => utils.zip(startTimes, commitsByWeek))
            .then(timeCountPairs => timeCountPairs.reduce(utils.addKeyValueToObject, {}));
    }

    /**
     *  Get number of lines of code and number of files by extension.
     *  @param {Object} options - The options
     *  @param {Array.<string>} [options.excludedDirs=['.git']]
     *      - A list of directories to be excluded. Only '.git' by default
     *  @param {Array.<string>} [options.excludedExts=[]]
     *      - A list of extensions to be excluded.
     *
     *  @return {Object.<string, Object>} metrics
     *      - The number of lines of code and number of files by extension
     *  @return {number} metrics.<extension>.numberOfFiles
     *      - The number of files with <extension>
     *  @return {number} metrics.<extension>.numberOfLines
     *      - The number of lines in files with <extension>
     */
    getLinesOfCode({
            excludedDirs = ['.git'],
            excludedExts = []} = {}) {

        /**
         *  A 'reducer' function to accumulate the file metrics to its extension
         *  @param {Object} acc - The object to accumulate the metrics to.
         *  @param {Object} file - The information of the file.
         *  @param {string} file.ext - The extension of the file.
         *  @param {string} file.contents - The contents of the file.
         *
         *  @result {Object} acc - The accumulated object.
         *  @result {number} acc.<extension>.numberOfFiles
         *      - The number of files with <extension>
         *  @result {number} acc.<extension>.numberOfLines
         *      - The number of lines in files with <extension>
         */
        function accumulateExtContents (acc, file) {
            const numberOfLines = file.contents.split('\n').length;
            // if the file extension key exists
            // add to existing key
            if (acc[file.ext]) {
                acc[file.ext] = {
                    numberOfFiles: acc[file.ext].numberOfFiles + 1,
                    numberOfLines: acc[file.ext].numberOfLines + numberOfLines
                };
            // otherwise, create an new key
            } else {
                acc[file.ext] = {
                    numberOfFiles: 1,
                    numberOfLines: numberOfLines
                };
            }
            return acc;
        }

        /**
         *  Returns true if the file path is in an excluded directory, otherwise false
         *  @param {string} relativePath - The relative path of the file
         *
         *  @return {boolean} - Returns if the file is in the list of excluded directories 
         */
        function isInExcludedDir(relativePath) {
            for (const excludedDir of excludedDirs) {
                if (relativePath.startsWith(excludedDir)) {
                    return true;
                }
            }
            return false;
        }

        /**
         *  Returns true if the file name has an excluded extension, otherwise false
         *  @param {string} relativePath - The relative path of the file
         *
         *  @return {boolean} - Returns if the file has an excluded extension
         */
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
                topLevelPath: clone.path,
                lengthOfTopLevelPath: clone.path.length,
                fileNames: await dir.promiseFiles(clone.path)}))
            // remove top level path from file paths
            .then(filesInfo => ({
                topLevelPath: filesInfo.topLevelPath,
                fileNames: filesInfo.fileNames.map(
                    name => name.slice(filesInfo.lengthOfTopLevelPath + 1))}))
            // filter out excluded directories, if there are any
            .then(filesInfo => (excludedDirs.length ? {
                topLevelPath: filesInfo.topLevelPath,
                fileNames: filesInfo.fileNames.filter(name => !isInExcludedDir(name))
            } : filesInfo))
            // filter out excluded extensions, if there are any
            .then(filesInfo => (excludedExts.length ? {
                topLevelPath: filesInfo.topLevelPath,
                fileNames: filesInfo.fileNames.filter(name => !hasExcludedExt(name))
            } : filesInfo))
            // map files to extension and contents of each file
            .then(({topLevelPath, fileNames}) => fileNames.map(async (name) => ({
                ext: path.extname(name),
                contents:  await fs.readFile(path.join(topLevelPath, name), 'utf8')})))  // TODO: revisit
            // wait until all files have been read
            .then(readPromises => Promise.all(readPromises))
            // accumulate metrics into one object
            .then(files => files.reduce(accumulateExtContents, {}));
    }
};