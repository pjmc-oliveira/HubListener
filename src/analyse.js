
const fs = require('fs');

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
        return Promise.resolve({});
    }
};

module.exports = analyse;