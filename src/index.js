const express = require('express');

const { Data } = require('./data.js');
const { Client } = require('./client.js');
const { Database } = require('./database.js');
const utils = require('./utils.js');
const mkLogger = require('./log.js');

const app = express();
const port = 8080;
const logger = mkLogger({label: __filename, level: 'info'});


// promise to a database wrapper
const db = Database.init('hubdata.sqlite3');

app.use(express.static('static')); // Serve static files from the 'static' directory
app.use(express.json()); // Parse json encoded request bodies

/**
 * API endpoint tp run the analysis on the given GitHub project URL.
 * Parses JSON input.
 * 
 * @param {string} url - the GitHub URL to analyse
 * @param {object} options - the analysis options
 * 
 * @return {object}
 *      the object containing the metrics
 */
app.post('/analyse', async (req, res) => {
    // disable request timeout...
    req.setTimeout(0);
    logger.info('[POST] request to /analyse');

    const start = Date.now();

    // parse url from body
    const url = req.body.url;
    const options = {
        quick: req.body.quick
    };

    // begin clone and update local copy of repository
    const data = await Data.init(url, db, options);

    const {owner, name} = utils.parseURL(url);
    const client = new Client({
        owner,
        name,
    });

    // analyse data
    const points = await data.analyse(options);

    const end = Date.now();
    logger.info(`time elapsed: ${Math.round((end - start) / 1000)}s`);
    res.send({
        points: points,
        issues: await client.getAllIssues(),
        forks: await client.getNumberOfForks(),
        pulls: await client.getPullRequests()
    });
});

app.listen(port, () => console.log(`listening on ${port}`));