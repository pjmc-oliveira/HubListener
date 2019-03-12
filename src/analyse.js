const fs = require('fs');
const { spawn } = require('child_process');
const os = require('os');
const escomplex = require('escomplex');
const mkLogger = require('./log.js');

const logger = mkLogger({label: __filename});

/**
 *  A namespace containing analyser functions.
 *  @namespace
 */
const analyse = {
    /**
     *  Metric
     *  @typedef {object} Metric
     *  @property {string} name - short human readable text describing the metric
     *  @value {number} value - the value of the metric
     *
     *  Summary for a generic file extension
     *  @typedef {object} GenericAnalysisReport
     *  @property {Metric} numberOfFiles - The number of files with the extension
     *  @property {Metric} numberOfLines
     *      The total number of physical lines with the extension
     */

    /**
     *  Analyses a generic text files.
     *  @param {Array<string>} paths - An array of absolute file paths
     *
     *  @return {GenericAnalysisReport} A report of all analyses performed on the given extension
     */
    generic: function(paths) {

        const readFile = path => fs.readFileSync(path, 'utf8');
        const countLines = contents => contents.split('\n').length;
        const getLinesFromFile = path => countLines(readFile(path));
        const totalLines = paths
            .map(getLinesFromFile)
            .reduce((a, b) => a + b, 0);

        return Promise.resolve({
            numberOfFiles: {name: 'Number of files', value: paths.length},
            numberOfLines: {name: 'Number of lines', value: totalLines}
        });
    },

    /**
     *  Metric
     *  @typedef {object} Metric
     *  @property {string} name - short human readable text describing the metric
     *  @value {number} value - the value of the metric
     *
     *  Static Analysis report for Javascript code
     *  @typedef {object} JsAnalysisReport
     *  @property {Metric} numberOfFiles
     *  @property {Metric} cyclomatic
     *  @property {Metric} maintainability
     *  @property {Metric} numberOfComments
     *  @property {Metric} numberOfLines
     *  @property {Metric} numberOfLogicalLines
     *  @property {Metric} effort
     *  @property {Metric} changeCost
     *  @property {Metric} avgDependencies
     */

    /**
     *  Performs static code analysis on a set of javascript files
     *  @param {Array<string>} paths - An array of absolute file paths
     *
     *  @return {JsAnalysisReport} A report of static analysis performed on javascript code
     */
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

            let escomplexReport;

            try {
                escomplexReport = escomplex.analyse(source, {});
            } catch (e) {
                // Parse failure, skip and return basic analysis
                logger.warn(e);
                resolve(analyse.generic(paths));
            }


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
                numberOfFiles: {name: 'Number of files', value: paths.length},
                cyclomatic: {name: 'Cyclomatic complexity', value: escomplexReport.cyclomatic},
                maintainability: {name: 'Maintainability index', value: escomplexReport.maintainability},
                numberOfComments: {name: 'Number of lines of comments', value: totalComments},
                numberOfLines: {name: 'Physical lines of code', value: sloc},
                numberOfLogicalLines: {name: 'Logical lines of code', value: lsloc},
                effort: {name: 'Halstead effort', value: escomplexReport.effort},
                changeCost: {name: 'Change cost', value: escomplexReport.changeCost},
                avgDependencies: {name: 'Average number of dependencies per file', value: (dependencies / escomplexReport.reports.length)}
            };

            resolve(finalReport);
        });
    },

    python: function(paths) {
        return new Promise((resolve, reject) => {
            try {
                // By default macOS `python` is v2.*
                // call user aliased `python3`
                const pythonExe = os.platform() === 'darwin' ? 'python3' : 'python';
                const scriptName = 'external/analyse.py';

                // converts function that takes in JSON, into function that takes in bytes
                const jsonifyBytes = fn => bytes => fn(JSON.parse(bytes.toString('utf8')));


                const program = spawn(pythonExe, [scriptName, ...paths]);

                // Allow functions to take in bytes
                resolve = jsonifyBytes(resolve);
                reject = jsonifyBytes(reject);

                program.stdout.on('data', resolve);
                program.stderr.on('data', reject);

            } catch (e) {
                logger.warn("Python analysis failed.  Falling back to default.  Details:");
                logger.warn(e);
                resolve(analyse.generic(paths));
            }
        });
    }
};

module.exports = analyse;