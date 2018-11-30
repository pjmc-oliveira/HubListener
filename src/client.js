'use strict';

// required for reading files
const fs = require('fs');

// required for connecting to GraphQL API
const graphqlClient = require('graphql-client');

// a simple wrapper that initializes our GraphQL client with the auth token
module.exports.Client = class Client {
    constructor(givenToken) {
        try {
            this.token = givenToken || fs.readFileSync('./auth_token.txt', 'utf8');
        } catch (err) {
            // catch common causes of errors
            console.log('An error occurred loading the authentication token!');
            console.log('Verify you have the \'auth_token.txt\' file saved on this directory.');
            console.log('Details');
            throw err;
        }
        
        // initialize GraphQL client
        // See [https://github.com/nordsimon/graphql-client#readme] for details
        this.client = graphqlClient({
            url: 'https://api.github.com/graphql',
            headers: {
                Authorization: 'bearer ' + this.token
            }
        });
    }

    // simple wrapper for most common tasks
    // client available through ._client directly
    query(Q, vars) {
        return this.client.query(Q, vars);
    }
};