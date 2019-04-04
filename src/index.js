const express = require('express');

const { Data } = require('./data.js');
const { Database } = require('./database.js');
const mkLogger = require('./log.js');

const app = express();
const port = 8080;
const logger = mkLogger({label: __filename, level: 'info'});


// promise to a database wrapper
const db = Database.init('hubdata.sqlite3');

app.use(express.static('static'));
app.use(express.json());

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
    const { url, options } = req.body;

    // begin clone and update local copy of repository
    const data = await Data.init(url, db, options);

    // analyse data
    const points = await data.analyse();

    const end = Date.now();
    logger.info(`time elapsed: ${Math.round((end - start) / 1000)}s`);
    res.send({ points });
});

app.listen(port, () => console.log(`listening on ${port}`));