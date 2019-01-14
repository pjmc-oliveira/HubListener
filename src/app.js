/**
    app.js serves as the main entry point for Hublistener.
 */

const utils = require('./utils');
const { Data } = require ('./data');

function main(args) {
    // Available options and flags
    // NOTE: Update options message whenever a new option is added or removed
    // TODO: add option to provide auth token string as an argument
    // TODO: add option to read auth token from environment variables
    // TODO: add option to export output into JSON file
    const optionsMsg = `
    Usage:  node app.js [--url <url>] [options...]

    -h, --help  : print command line options
    --url <url> : GitHub project url
    --no-clone  : Don't clone repository

    Documentation can be found at:
    https://github.com/pjmc-oliveira/HubListener
    `;

    // Parse arguments
    let options;
    try {
        options = utils.argParse(args);
    } catch (error) {
        console.log(error);
        console.log(optionsMsg);
        return;
    };

    // If help flag, display options and exit
    if (options['h'] || options['help']) {
        console.log(optionsMsg);
        return;
    }

    const repoUrl = options['url'];
    // If no repository url was provided, display options and exit
    if (repoUrl === undefined) {
        console.log(optionsMsg);
        return;
    }

    // Create new Data object
    const data = new Data(repoUrl, {noClone: options['no-clone']});

    data.getNumberOfCommitsByTime().then(x => {
        console.log(x)
    });
}

main(process.argv);