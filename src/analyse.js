const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');

/**
 *  A namespace containing analyser functions.
 *  @namespace
 */
const analyse = {
    /**
     *  Summary for a generic file extension
     *  @typedef {object} GenericExtSummary
     *  @property {number} numberOfFiles - The number of files with the extension
     *  @property {number} numberOfLines
     *      The total number of physical lines with the extension
     */

    /**
     *  Analyses a generic text files.
     *  @param {Array<string>} paths - The paths to all the files
     *
     *  @return {GenericExtSummary} The extension summary
     */
    generic: function(paths) {

        const readFile = path => fs.readFileSync(path, 'utf8');
        const countLines = contents => contents.split('\n').length;
        const getLinesFromFile = path => countLines(getLinesFromFile(path));
        const totalLines = paths
            .map(getLinesFromFile)
            .reduce((a, b) => a + b, 0);

        return Promise.resolve({
            numberOfFiles: paths.lenth,
            numberOfLines: totalLines
        });
    },

    javascript: function(paths) {
        return Promise.resolve({});
    },

    python: function(paths) {
        // By default macOS `python` is v2.*
        // call user aliased `python3`
        const pythonExe = os.platform() === 'darwin' ? 'python3' : 'python';
        const scriptName = 'external/analyse.py';

        // converts function that takes in JSON, into function that takes in bytes
        const jsonifyBytes = fn => bytes => fn(JSON.parse(bytes.toString('utf8')));

        return new Promise((resolve, reject) => {
            const program = spawn(pythonExe, [scriptName, ...paths]);

            // Allow functions to take in bytes
            resolve = jsonifyBytes(resolve);
            reject  = jsonifyBytes(reject);

            program.stdout.on('data', resolve);
            program.stderr.on('data', reject);

        });
    }
};

module.exports = analyse;