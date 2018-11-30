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
        const vars = {name: this.repoName, owner: this.owner};
        const query = `
            query repo($name: String!, $owner: String!){
                repository(name: $name, owner: $owner){
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
        return this.client.query(query, vars).then(body => {
            return body.data.repository
        }).then(repo => {
            return {
                total: repo.total.totalCount,
                open: repo.open.totalCount,
                closed: repo.closed.totalCount,
            };
        });
    }
};