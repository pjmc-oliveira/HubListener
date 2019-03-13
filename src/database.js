const sqlite3 = require('sqlite3');
const { promisify } = require('util');

async function loadMetricTypes(db) {
    let mapping = {};
    const query = 'SELECT id, name FROM MetricTypes;';
    const _all = promisify(db.all.bind(db));
    await _all(query, [])
        .then(rs => rs.forEach(r => mapping[r.id] = r.name))
        .catch(err => console.log(err));
    return mapping;
}

async function makeDB(name) {
    // make our wrapped db pointer
    const _db = new sqlite3.Database(name, sqlite3.OPEN_READWRITE);
    // for this to work properly we need to bind the databse to the function
    const _get = promisify(_db.get.bind(_db));
    const _run = promisify(_db.run.bind(_db));
    const _all = promisify(_db.all.bind(_db));
    
    return {
        metrics: await loadMetricTypes(_db),
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
            }
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
            }
        }
    };
}

module.exports = {
    makeDB: makeDB
};