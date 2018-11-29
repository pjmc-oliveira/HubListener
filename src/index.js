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

// simple function to find the median of a **sorted** list
function median(values) {
    if (values.length === 0) {
        return 0;
    }

    const half = Math.floor(values.length / 2);
    if (values.length % 2)
        return values[half];
    else
        return (values[half - 1] + values[half]) / 2.0;
}



// get the repo URL
const repo_url = process.argv[2];
// process.argv: returns the command line arguments used as an array
// [2]: return the 2th element, (0th = node, 1th = script name)

const vars = parse_repo_url(repo_url);

// variable to store key_metrics and raw_data
var key_metrics = {};
var raw_data = {};

const client = new Client();

// requests are promises [https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Using_promises]
// the first query will return a JSON
client.query(`
    query repo($name: String!, $owner: String!){
        repository(name: $name, owner: $owner){
            name
            createdAt
            description
            forkCount
            collaborators {
                totalCount
            }
            issues {
                totalCount
            }
            open_issues: issues (states: [OPEN]) {
                totalCount
            }
            closed_issues: issues (states: [CLOSED]) {
                totalCount
            }
        }
    }
`, vars)
// this block will only execute *after* the request gets its response
.then(body => {
    key_metrics.name = body.data.repository.name;
    key_metrics.createdAt = body.data.repository.createdAt;
    key_metrics.description = body.data.repository.description;
    key_metrics.forkCount = body.data.repository.forkCount;
    key_metrics.number_of_collaborators = body.data.repository.collaborators.totalCount;
    key_metrics.number_of_issues = body.data.repository.issues.totalCount;
    key_metrics.number_of_issues_open = body.data.repository.open_issues.totalCount;
    key_metrics.number_of_issues_closed = body.data.repository.closed_issues.totalCount;
})
// make a new request and continue cycle
.then(_ => client.query(`
    query repo(
            $name: String!, $owner: String!,
            $number_of_collaborators: Int!, $number_of_issues: Int!){
        repository(name: $name, owner: $owner){
            collaborators (first: $number_of_collaborators) {
                nodes {
                    login
                    name
                }
            }
            issues_open: issues (
                    states: [OPEN]
                    first: $number_of_issues,
                    orderBy: {field:CREATED_AT, direction:ASC}) {
                nodes {
                    state
                    createdAt
                }
            }
            issues_closed: issues (
                    states: [CLOSED]
                    first: $number_of_issues,
                    orderBy: {field:CREATED_AT, direction:ASC}) {
                nodes {
                    state
                    createdAt
                    closedAt
                }
            }
        }
    }
`, {...vars, ...key_metrics})) // object spread [https://github.com/tc39/proposal-object-rest-spread]
.then(body => {
    key_metrics.collaborators = body.data.repository.collaborators.nodes;
    raw_data.issues_open = body.data.repository.issues_open.nodes.map(
        node => {return {timeOpen: (Date.now() - Date.parse(node.createdAt)) / (1000 * 60), ...node}});


    raw_data.issues_closed = body.data.repository.issues_closed.nodes.map(
        node => {return {timeToClose: (Date.parse(node.closedAt) - Date.parse(node.createdAt)) / (1000 * 60), ...node}});
})
// at the end print acquired key_metrics
.then(body => {
    // summarize percentage of issues that were closed
    key_metrics.issue_closed_percent = (key_metrics.number_of_issues_closed / key_metrics.number_of_issues) * 100;

    // analyze issue closing times
    const issue_closing_times = raw_data.issues_closed
        .map(issue => issue.timeToClose)
        .sort((a, b) => a - b);

    key_metrics.issue_closing_times = {};
    key_metrics.issue_closing_times.sum = issue_closing_times.reduce((acc, val) => acc + val);
    key_metrics.issue_closing_times.count = key_metrics.number_of_issues_closed;
    key_metrics.issue_closing_times.mean = key_metrics.issue_closing_times.sum / key_metrics.issue_closing_times.count;
    key_metrics.issue_closing_times.median = median(issue_closing_times);

    // analyze issue open times
    const issue_open_times = raw_data.issues_open
        .map(issue => issue.timeOpen)
        .sort((a, b) => a - b);
    key_metrics.issue_open_times = {};
    key_metrics.issue_open_times.sum = issue_open_times.reduce((acc, val) => acc + val);
    key_metrics.issue_open_times.count = key_metrics.number_of_issues_open;
    key_metrics.issue_open_times.mean = key_metrics.issue_open_times.sum / key_metrics.issue_open_times.count;
    key_metrics.issue_open_times.median = median(issue_open_times);

    console.log(key_metrics);
})
.catch(err => console.log(err.message));

// Clone repository and perform analysis on files
var git = require('nodegit'); // package providing git manipulation in node
var tmp = require('tmp'); // convenience package providing temp file/dir creation and cleanup
var dir = require('node-dir'); // convenience package providing file/dir operations
var path = require('path');

// Async call to create temp directory for working with repo files
tmp.dir(function _tempDirCreated(err, tmpDir) {
   if (err) throw err;

   // Clone repo to temp directory
   console.log('Cloning repo: ' + repo_url + ' to directory: ' + tmpDir);
   git.Clone(repo_url, tmpDir).then(function(repo) {
        // Successfully cloned repo
       console.log('Succesfully cloned repository to ' + tmpDir);
       var fileMetrics = {};

       // Recursively read files, excluding .git directory
       dir.readFiles(tmpDir, {
               excludeDir: ['.git']
           // Callback with file content and filename
           }, function(err, content, filename, next) {
               if (err) throw err;

               ext = path.extname(filename);

               // Create new entry in fileMetrics map for extension
               if (!fileMetrics[ext]) {
                   fileMetrics[ext] = {files: 1, lines: content.split("\n").length};
               // Increment filecount and linecount for extensions previously found
               } else {
                   fileMetrics[ext] = {files: fileMetrics[ext].files + 1, lines: fileMetrics[ext].lines + content.split("\n").length};
               }
               next();
           },
           // Finished reading files
           function(err, files){
               if (err) throw err;

               console.log(fileMetrics);
           });
   });
});