'use strict';

// node and npm modules
const fs = require('fs');
const graphqlClient = require('graphql-client');

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
    constructor(givenToken) {
        try {
            /**
             *  The API token
             *  @name Client#token
             *  @type {string}
             */
            this.token = givenToken || fs.readFileSync('./auth_token.txt', 'utf8').trim();
        } catch (err) {
            // catch common causes of errors
            console.log('An error occurred loading the authentication token!');
            console.log('Verify you have the \'auth_token.txt\' file saved on this directory.');
            console.log('Details');
            throw err;
        }
        
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
}

module.exports = {
    Client: Client
};