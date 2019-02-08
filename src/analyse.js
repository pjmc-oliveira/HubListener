const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const escomplex = require('escomplex');

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
        const getLinesFromFile = path => countLines(readFile(path));
        const totalLines = paths
            .map(getLinesFromFile)
            .reduce((a, b) => a + b, 0);

        return Promise.resolve({
            numberOfFiles: paths.length,
            numberOfLines: totalLines
        });
    },

    javascript: function(paths) {
        return new Promise((resolve, reject) => {
            let source = [];
            let totalComments = 0;

            for (let path of paths) {
                let code = fs.readFileSync(path, 'utf8');

                // Add file and contents to source object for later digestion by escomplex
                source.push({
                    path: path,
                    code: code
                });

                // Count comments in each file
                let commentPattern = /(?:(?<!\\)("|'|`)[\s\S]*?(?<!\\)\1)|(?:\/(?!\*)[^\r\n\f]+(?<!\\)\/)|(\/\*[\s\S]*?\*\/)|(\/\/[^\r\n\f]*)/g;
                let commentLines = 0;
                let match;

                while(match = commentPattern.exec(code)) {
                    // Group 2 = block comments
                    if (match[2]) {
                        commentLines += match[2].split('\n').length;
                    }
                    // Group 3 = line comments
                    if (match[3]) {
                        commentLines++;
                    }
                }

                totalComments += commentLines;
            }

            let escomplexReport = escomplex.analyse(source, {});

            // Total physical lines of code
            let sloc = 0;

            // Total logical lines of code
            let lsloc = 0;

            // Non unique dependencies
            let dependencies = 0;

            for (let report of escomplexReport.reports) {
                sloc += report.aggregate.sloc.physical;
                lsloc += report.aggregate.sloc.logical;
                dependencies += report.dependencies.length;
            }

            let finalReport = {
                numberOfFiles: paths.length,
                cyclomatic: escomplexReport.cyclomatic,
                maintainability: escomplexReport.maintainability,
                numberOfComments: totalComments,
                numberOfLines: sloc,
                numberOfLogicalLines: lsloc,
                effort: escomplexReport.effort,
                changeCost: escomplexReport.changeCost,
                avgDependencies: dependencies / escomplexReport.reports.length
            };

            resolve(finalReport);
        });
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