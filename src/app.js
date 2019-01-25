
// user defined modules
const utils = require('./utils');
const { Data } = require ('./data');

/**
 *  Serves as the main entry point to the HubListener CLI app
 *  @function
 *  @param {Array<string>} args - The un-parsed array of command-line arguments
 */
function main(args) {
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
    } catch (error) {
        console.log(error);
        console.log(optionsMsg);
        return;
    }

    // If help flag, display options and exit
    if (options['h'] || options['help']) {
        console.log(optionsMsg);
        return;
    }

    const repoUrl = options['u'] || options['url'];
    // If no repository url was provided, display options and exit
    if (repoUrl === undefined) {
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

    data.getNumberOfCommitsByTime().then(x => {
        output(x);
    });
}

main(process.argv);