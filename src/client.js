'use strict';

// node and npm modules
const moment = require('moment');
const fs = require('fs');
const graphqlClient = require('graphql-client');

// user defined modules
const utils = require('./utils.js');

/**
 *  @class The Client class is a simple wrapper that initializes our
 *  [GraphQL]{@link https://graphql.org} client with the auth token. Current
 *  implementation uses
 *  [graphql-client]{@link https://github.com/nordsimon/graphql-client#readme}.
 */
class Client {
    /**
     *  Constructs a {@link Client} object.
     *  @param {string} [givenToken]
     *      A [GitHub authentication token]{@link https://github.com/settings/tokens}
     *      to connect to the [GitHub API]{@link https://developer.github.com/v4/}.
     *      The token needs `public_repo` access. If a token is not provided,
     *      the program will attempt to read from a named file 'auth_token.txt'
     *      on the `src` directory. If none exists the constructor will crash.
     */
    constructor({owner, name, auth_token}) {
        try {
            /**
             *  The API token
             *  @name Client#token
             *  @type {string}
             */
            this.token = auth_token || fs.readFileSync('./auth_token.txt', 'utf8').trim();
        } catch (err) {
            // catch common causes of errors
            console.log('An error occurred loading the authentication token!');
            console.log('Verify you have the \'auth_token.txt\' file saved on this directory.');
            console.log('Details');
            throw err;
        }

        this.owner = owner;
        this.name = name;
        
        /**
         *  The API client, see
         *  [documentation]{@link https://github.com/nordsimon/graphql-client#readme}
         *  @name Client#client
         *  @type {graphql-client}
         */
        // initialize GraphQL client
        this.client = graphqlClient({
            url: 'https://api.github.com/graphql',
            headers: {
                Authorization: 'bearer ' + this.token
            }
        });
    }

    /**
     *  A simple wrapper for most common tasks client available through
     *  Client#client directly.
     *  @param {string} Q - The [GraphQL]{@link https://graphql.org} query.
     *  @param {object} vars - The variables to be replaced in the query.
     */
    query(Q, vars) {
        return this.client.query(Q, vars);
    }

    async getMetaAnalysis(commits = []) {
        const unalignedIssues = await this.getAllIssues();
        const unalignedPulls = await this.getPullRequests();
        const issues = utils.alignIssuesToCommits(unalignedIssues, commits);
        const pulls = utils.alignPullsToCommits(unalignedPulls, commits);

        let results = {};
        for (const {commit_id} of commits) {
            results[commit_id] = {}
            for (const source of [issues, pulls]) {
                results[commit_id] = {...results[commit_id], ...source[commit_id]};
            }
        }

        return results;
    }

    async getNumberOfForks() {
        const query = `
            query repo {
                repository(name: "${this.name}", owner: "${this.owner}") {
                    forks {
                        totalCount
                    }
                }
        }`;

        return await this.query(query, {})
            .then(body => body.data.repository.forks.totalCount);
    }

    async getPullRequests(pageSize = 100) {
        // create query to query first `pageSize` issues after cursor
        // or first `pageSize` issues if no cursor is provided
        const issuesQuery = cursor => `
            query repo {
                repository(name: "${this.name}", owner: "${this.owner}") {
                    pullRequests (
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
            const edges = await this.query(issuesQuery(cursor), {})
                // unwrap data, if no issues, return []
                .then(body => body.data ? body.data.repository.pullRequests.edges : []);

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
                repository(name: "${this.name}", owner: "${this.owner}") {
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
            const edges = await this.query(issuesQuery(cursor), {})
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
                repository(name: "${this.name}", owner: "${this.owner}"){
                    stargazers {
                        totalCount
                    }
                }
            }`;
        return this.query(query, {})
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
                repository(name: "${this.name}", owner: "${this.owner}"){
                    pullRequests {
                        totalCount
                    }
                }
            }`;
        return this.query(query, {})
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
                repository(name: "${this.name}", owner: "${this.owner}"){
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
        return this.query(query, {})
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
                repository(name: "${this.name}", owner: "${this.owner}"){
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
                this.query(
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
}

module.exports = {
    Client: Client
};