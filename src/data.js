'use strict';

const moment = require('moment');

const {Client} = require('./client.js');
const {Clone} = require('./clone.js');
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
};