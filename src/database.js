const sqlite3 = require('sqlite3');
const { promisify } = require('util');

async function loadMetricTypes(db) {
    let byId = {};
    let byName = {};
    const query = 'SELECT id, name FROM MetricTypes;';
    const _all = promisify(db.all.bind(db));
    await _all(query, [])
        .then(rs => rs.forEach(r => {
            byId[r.id] = r.name;
            byName[r.name] = r.id;
        }))
        // .catch(err => console.log(err));
    return { byId, byName };
}

async function makeDB(name) {
    // make our wrapped database pointer
    const _db = new sqlite3.Database(name, sqlite3.OPEN_READWRITE);
    // promisify functions
    // for this to work properly we need to bind the databse to the function
    const _get = promisify(_db.get.bind(_db));
    const _all = promisify(_db.all.bind(_db));
    // `run` has a weird format where it always calls the callback
    // either passing an error as the parameter
    // or with some information bound to the `this` of the function
    const _run = (q, ps) => new Promise((resolve, reject) => 
        _db.run(q, ps, function (err) {
            if (err) {
                reject(err);
            } else {
                resolve(this);
            }
        })
    );

    // Keep a local copy of metrics
    // so we can refer to it internally
    const metrics = await loadMetricTypes(_db);
    
    return {
        // change to two way
        // metrics.id[x] -> ...
        // metrics.type[y] -> ...
        metrics: metrics,
        get: {
            repo: ({id, owner, name}) => {
                if (id) {
                    const query = 'SELECT * FROM Repositories WHERE id = (?);';
                    return _get(query, [id]);
                } else {
                    const query = 'SELECT * FROM Repositories WHERE owner = (?) AND name = (?);';
                    return _get(query, [owner, name]);
                }
            },
            repos: () => {
                const query = 'SELECT * FROM Repositories;';
                return _all(query, []);
            },
            lastCommit: (repo_id) => {
                const query = `
                    SELECT commit_id, commit_date
                    FROM MetricValues
                    WHERE
                        repo_id = (?)
                    ORDER BY commit_date DESC
                    LIMIT 1;`;
                return _get(query, [repo_id]);
            },
            valuesUntil: ({repo_id, end_date}) => {
                const query = `
                    SELECT
                        v.repo_id,
                        v.commit_id,
                        v.commit_date,
                        v.file_extension,
                        t.name AS 'metric_type',
                        v.metric_value
                    FROM MetricValues v
                        INNER JOIN MetricTypes t
                        ON v.metric_type_id = t.id
                    WHERE
                        repo_id = (?) AND
                        commit_date <= (?)
                    ORDER BY commit_date DESC;`;
                return _all(query, [repo_id, end_date]);
            },
        },
        insert: {
            repo: ({owner, name}) => {
                const query = 'INSERT INTO Repositories (owner, name) VALUES (?, ?);';
                return _run(query, [owner, name]);
            }
        },
        safeInsert: {
            repo: ({owner, name}) => {
                const query = 'INSERT OR IGNORE INTO Repositories (owner, name) VALUES (?, ?);';
                return _run(query, [owner, name]);
            },
            /**
             *  Safe insert values
             *  [{commit_id, commit_date, valuesByExt}]*
             */
            values: (repo_id, commitsToInsert) => {
                let stmt = _db.prepare(`
                    INSERT OR IGNORE INTO MetricValues
                    (repo_id, commit_id, commit_date, file_extension, metric_type_id, metric_value)
                    VALUES (?, ?, ?, ?, ?, ?)`);
                for (const {commit_id, commit_date, valuesByExt} of commitsToInsert) {
                    for (const [ext, metricsValues] of Object.entries(valuesByExt)) {
                        for (const [type, value] of Object.entries(metricsValues)) {
                            // only add defined metrics
                            if (type_id = metrics.byName[type]) {
                                const row = [repo_id, commit_id, commit_date, ext, type_id, value];
                                stmt.run(row);
                            }
                        }
                    }
                }
                // promisify the return
                return new Promise((resolve, reject) => {
                    stmt.finalize(function (err) {
                        if (err) {
                            reject(err);
                        } else {
                            resolve(this);
                        }
                    });
                });
            },
        }
    };
}

module.exports = {
    makeDB: makeDB
};