const sqlite3 = require('sqlite3');
const { promisify } = require('util');
const fs = require('fs');

async function loadMetricTypes(db) {
    let byId = {};
    let byName = {};
    const query = 'SELECT id, name FROM MetricTypes;';
    const _all = promisify(db.all.bind(db));
    await _all(query, [])
        .then(rs => rs.forEach(r => {
            byId[r.id] = r.name;
            byName[r.name] = r.id;
        }));
        // .catch(err => console.log(err));
    return { byId, byName };
}

class Database {
    /**
     *  Initialize and load database. Use this to create a {@link Database} object instance.
     *  Will execute database definition script to create database if not yet created.
     *  
     *  @param {string} filename - Name of database file
     */
    static async init(filename) {
        // make our wrapped database pointer
        const _db = new sqlite3.Database(filename);

        // Execute schema.sql, the script does nothing it if has already been run
        const schema = fs.readFileSync('schema.sql', 'utf-8');
        _db.exec(schema);

        // Pre-load metrics
        const metrics = await loadMetricTypes(_db);

        return new Database({_db, metrics});
    }

    constructor({_db, metrics}) {
        this._db = _db;
        this.metrics = metrics;

        // promisify functions
        // for this to work properly we need to bind the databse to the function
        this._get = promisify(_db.get.bind(_db));
        this._all = promisify(_db.all.bind(_db));
        // `run` has a weird format where it always calls the callback
        // either passing an error as the parameter
        // or with some information bound to the `this` of the function
        this._run = (q, ps) => new Promise((resolve, reject) => 
            _db.run(q, ps, function (err) {
                if (err) reject(err);
                else resolve(this);
            })
        );
    }

    async getRepoId({owner, name}) {
        const getQuery = 'SELECT * FROM Repositories WHERE owner = (?) AND name = (?);';
        // get repo row if present
        const row = await this._get(getQuery, [owner, name]);

        // insert repo if not present
        if (!row) {
            const insertQuery = 'INSERT INTO Repositories (owner, name) VALUES (?, ?);';
            const stmt = await this._run(insertQuery, [owner, name]);
            // return id of new row (a.k.a. the repo just inserted)
            return stmt.lastID;
        }

        // id of present repo
        return row.id;
    }

    async getLastCommit(repo_id) {
        const query = `
            SELECT commit_id, commit_date
            FROM MetricValues
            WHERE
                repo_id = (?)
            ORDER BY commit_date DESC
            LIMIT 1;`;
        
        // get last commit of repo in database
        const row = await this._get(query, [repo_id]);

        if (row) {
            // format commit info
            return {
                commit_id: row.commit_id,
                commit_date: new Date(row.commit_date),
            };
        }

        // return null if no commits from repo
        return null;
    }

    getValuesUntil(repo_id, end_commit) {
        // return promise to empty list if no date provided
        if (!end_commit || !end_commit.commit_date)
            return Promise.resolve([]);

        const end_date = end_commit.commit_date;

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

        // return values until end date
        return this._all(query, [repo_id, end_date]);
    }
    
    insertValues(rowsToInsert) {
        let stmt = this._db.prepare(`
            INSERT OR IGNORE INTO MetricValues
            (repo_id, commit_id, commit_date, file_extension, metric_type_id, metric_value)
            VALUES (?, ?, ?, ?, ?, ?)`);

        let type_id;

        for (const row of rowsToInsert){
            // only add defined metrics
            if (type_id = this.metrics.byName[row.metric_type]) {
                stmt.run([
                    row.repo_id,
                    row.commit_id,
                    row.commit_date,
                    row.file_extension,
                    type_id,
                    row.metric_value,
                ]);
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
    }
}

module.exports = {
    Database: Database,
};