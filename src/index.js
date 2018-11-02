/*
This script is a Proof of Concept for HubListener (working title)
To run this, follow the instructions:
- run 'npm install' on the 'src' directory to install required packages
- create a personal auth token from GitHub
    'https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/'
- save the token (and only the token) in a file named 'auth_token.txt' in the 'src' directory
- run 'node index.js <repo_url>' on the command line
*/


// required for reading files
var fs = require('fs');

// a simple wrapper that initializes our GraphQL client with the auth token
class Client {
    constructor() {
        try {
            // read token from file
            this._token = fs.readFileSync('./auth_token.txt', 'utf8');
            // initialize GraphQL client
            // See [https://github.com/nordsimon/graphql-client#readme] for details
            this._client = require('graphql-client')({
                url: 'https://api.github.com/graphql',
                headers: {
                    Authorization: 'bearer ' + this._token
                }
            });
        } catch (err) {
            // catch common causes of errors
            console.log('An error occurred loading the authentication token!');
            console.log('Verify you have the \'auth_token.txt\' file saved on this directory.');
            console.log('Details');
            throw err;
        }
    }
    // simple wrapper for most common tasks
    // client available through ._client directly
    query(Q, vars) {
        return this._client.query(Q, vars);
    }
}

// simple function to get the repository name and owner from the URL
function parse_repo_url(url) {
    const url_parts = url.split('/');
    const index = url_parts.indexOf('github.com');
    if (index === -1) {
        throw 'Not a valid GitHub url (' + url + ')';
    }
    return {
        owner: url_parts[index + 1],
        name: url_parts[index + 2]
    };
}



// get the repo URL
const repo_url = process.argv[2];
// process.argv: returns the command line arguments used as an array
// [2]: return the 2th element, (0th = node, 1th = script name)

const vars = parse_repo_url(repo_url);

// variable to store metrics
var metrics = {};

const client = new Client();

// requests are promises [https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises]
// the first query will return a JSON
client.query(`
    query repo($name: String!, $owner: String!){
        repository(name: $name, owner: $owner){
            createdAt
            description
            forkCount
        }
    }
`, vars)
// this block will only execute *after* the request gets its response
.then(body => {
    metrics.createdAt = body.data.repository.createdAt;
    metrics.description = body.data.repository.description;
    metrics.forkCount = body.data.repository.forkCount
})
// make a new request and continue cycle
.then(_ => client.query(`
    query repo($name: String!, $owner: String!){
        repository(name: $name, owner: $owner){
            collaborators (first: 10) {
                nodes {
                    login
                    name
                }
            }
        }
    }
`, vars))
.then(body => metrics.collaborators = body.data.repository.collaborators.nodes)

.then(_ => client.query(`
    query repo($name: String!, $owner: String!){
        repository(name: $name, owner: $owner){
            collaborators (first: 10) {
                totalCount
            }
        }
    }
`, vars))
.then(body => metrics.number_of_collaborators = body.data.repository.collaborators.totalCount)
// at the end print acquired metrics
.then(body => console.log(metrics))
.catch(err => console.log(err.message));
