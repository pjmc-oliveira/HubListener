/**
    app.js serves as the main entry point for Hublistener.
 */

const fs = require ('fs');
const utils = require('./utils');
const {Data} = require ('./data');

// Parse arguments
// const repo_url = process.argv[2];
// const vars = utils.parseURL(repo_url);

// Get auth token
// TODO: add option to provide path to auth token file or auth token string as an argument



const args = utils.argParse(process.argv)
console.log(args);

// Create Data object
// var data = new Data(repo_url);
// data.clonePromise.then(function (clone) {
//     console.log(clone.path);
// });