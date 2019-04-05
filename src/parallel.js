const os = require('os');
const path = require('path');
const { fork } = require('child_process');

const { Clone } = require('./clone.js');

async function parallelAnalysis(data, commit_ids, n_cpus = (os.cpus().length)) {
    console.log(`Starting analysis in ${n_cpus} cores...`);


    // split commits into alternating equal sized chunks
    let params = [];
    for (let n = 0; n < n_cpus; n++) {
       let chunk = [];
        for (let i = n; i < commit_ids.length; i += n_cpus) {
            chunk.push(commit_ids[i]);
        }
        const repo_path = path.join(__dirname, 'repos', `${n}`, data.owner, data.name);
        await Clone.init(data.clone.path, {clonePath: repo_path});
        params.push({
            path: repo_path,
            commit_ids: chunk,
        });
    }

    // fork analysis into separate processes
    let promises = [];
    for (const param of params) {
        let p = fork(__filename);
        p.send(param);
        // promisify process
        const promise = new Promise((resolve, reject) => {
            p.on('message', msg => {
                resolve(msg);
                p.kill();
            });
            p.on('error', msg => {
                reject(msg);
                p.kill();
            });
        });
        promises.push(promise);
    }

    // merge results
    let results = [];
    for (const result of await Promise.all(promises)) {
        results.push(...result);
    }
    return results;
}


async function analyseCommits({path, commit_ids}) {
    const clone = await Clone.fromPath(path);
    return clone.analyseCommits({commit_ids});;
}

process.on('message', async ({path, commit_ids}) => {
    const results = await analyseCommits({path, commit_ids});
    process.send(results);
});

module.exports = {
    parallelAnalysis,
    analyseCommits,
};