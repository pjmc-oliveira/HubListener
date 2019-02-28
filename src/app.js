
// user defined modules
const utils = require('./utils');
const mkLogger = require('./log.js');
const { Data } = require ('./data');

// create our logger object
const logger = mkLogger({label: __filename});

/**
 *  Serves as the main entry point to the HubListener CLI app
 *  @function
 *  @param {Array<string>} args - The un-parsed array of command-line arguments
 */
function main(args) {
    logger.debug('Started main function, with args:');
    logger.debug(args);

    // Available options and flags
    // NOTE: Update options message whenever a new option is added or removed
    // TODO: add option to provide auth token string as an argument
    // TODO: add option to read auth token from environment variables
    const optionsMsg = `
    Usage:  node app.js [--url <url>] [options...]

    -h, --help          : Print command line options
    -u, --url <url>     : GitHub project url
    --no-clone          : Don't clone repository
    -o, --out <file>    : Optional output file to output results
    -a, --append        : Append to file if exists (and output file specified)

    Documentation can be found at:
    https://github.com/pjmc-oliveira/HubListener
    `;

    // Parse arguments
    let options;
    try {
        options = utils.argParse(args);
        logger.debug('Successfully parsed command-line into:');
        logger.debug(options);
    } catch (err) {
        // Log exception
        logger.error('Failed parsing command-line arguments');
        logger.error(err.stack);

        // Advise possible solutions to user and exit
        console.log(err.message);
        console.log(optionsMsg);
        return;
    }

    // If help flag, display options and exit
    if (options['h'] || options['help']) {
        logger.debug('Printing help message...');
        console.log(optionsMsg);
        return;
    }

    const repoUrl = options['u'] || options['url'];
    // If no repository url was provided, display options and exit
    if (repoUrl === undefined) {
        logger.debug('No URL provided, printing help message...');
        console.log(optionsMsg);
        return;
    }

    // Create new Data object
    const data = new Data(repoUrl, {noClone: options['no-clone']});

    // Set the output function. default is console.log,
    // but can optionally write to file.
    const outputFilename = options['o'] || options['out'];
    const shouldAppend = options['a'] || options['append'];
    const output =  outputFilename ?
                    (obj => utils.writeToJSONFile(
                        obj, outputFilename, {append: shouldAppend})) :
                    console.log;

    data.clonePromise.then(async (clone) => {
        console.log(clone.path);
        const commits = (await clone.headCommitHistory()).reverse();
        const results = await clone.foreachCommit(commits,
            async (commit, index) => ({
                commit: commit.id().tostrS(),
                author: commit.author().toString(),
                index: index,
                date: commit.date().toISOString(),
                analisys: await data.getStaticAnalysis()}),
            (commit, error, index) => ({
                commit: commit.id().tostrS(),
                author: commit.author().toString(),
                index: index,
                date: commit.date().toISOString(),
                error: error
            }));

        let flattened = [];
        for (const result of results) {
            flattened.push(utils.flatten(result));
        }

        const csv = utils.jsonToCsv(flattened);
        // Need to make writeToJSONFile polymorphic enough to take in CSV strings
        const fs = require('fs');
        fs.writeFileSync(outputFilename, csv);
    });
}

try {
    main(process.argv);
} catch (err) {
    logger.error('Main function crashed!');
    logger.error(err.stack);
}