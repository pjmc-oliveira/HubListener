/**
 *  Simple script to automate routine dev functions.
 *  Should be updated accordingly.
 */

const { exec } = require('child_process');
const fs = require('fs');

/**
 *  Simple function to run JSDoc on a file or directory.
 *  Prints err, stdout, stderr to console.
 */
function updatedDoc(src) {
    console.log(`Running JSDoc on '${src}'...`);
    exec(`jsdoc ${src}`, (err, stdout, stderr) => {
        if (err) console.log('err: ', err);
        if (stdout) console.log('stdout: ', stdout);
        if (stderr) console.log('stderr: ', stderr);
    });
}

/**
 *  Main function
 */
function dev(args) {
    console.log('Running dev.js script, press ^C to exit.');
    // Update all the docs when first run
    updatedDoc('.');
    // Set up a watch to update any newly changed files
    fs.watch('.', { encoding: 'utf8'}, (eventType, filename) => {
        // Check if filename is valid, and not the output directory
        if (filename && filename !== 'out') {
            console.log(`Changes detected to '${filename}'...`);
            // For some reason JSDoc doesn't seem to update only the
            // changed files, without also removing the unchanged files.
            // Temporary solution is to re-compile the entire directory
            // Whenever a file changes.
            // TODO: Invoke JSDoc to only update changed files
            updatedDoc('.');
        }
    });
}

dev(process.argv);