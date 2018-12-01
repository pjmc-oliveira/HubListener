'use strict';

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
        this.clonePromise = Clone.init(url);
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
        return this.client.query(query, {}).then(
            body => body.data.repository
        ).then(
            repo => ({
                total: repo.total.totalCount,
                open: repo.open.totalCount,
                closed: repo.closed.totalCount,
            })
        );
    }

    /**
     *  Get details from the first N issues of each kind (any/open/closed)
     *  @param({
     *      total:  [number],
     *      open:   [number],
     *      closed: [number],
     *  })
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
        return this.client.query(query, {}).then(
            body => body.data.repository
        ).then(repo => ({
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
        }))

    }
};