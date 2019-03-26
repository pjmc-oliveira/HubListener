document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form');
    form.addEventListener('submit', submitForm);
});

function ajax(method, url, json) {
    console.log('making promise');
    return new Promise((resolve, reject) => {
        console.log('in promise')
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.onload = () => {
            console.log('in onload')
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(xhr.response);
            } else {
                reject(xhr);
            }
        };
        xhr.setRequestHeader("Content-Type", "application/json;charset=UTF-8");
        xhr.send(JSON.stringify(json));
    });
}

function form2json(form) {
    var result = {};
    for (const input of form) {
        if (input.type !== 'submit')
            result[input.name] = form[input.name].value;
    }
    return result;
}

function submitForm(event) {
    event.preventDefault();
    $("#form").hide();
    $("#loading").show();
    const json = form2json(event.target);
    ajax("POST", "/analyse", json)
        .then(x => {
            console.log(x); // dump results to log

            let data = JSON.parse(x).points;

            $("#loading").hide();
            $("#results").show();

            new Taucharts.Chart({
                data: data,
                type: 'line',
                x: 'commit_date',
                y: 'numberOfFiles',
                color: 'file_extension',
                guide: {
                    x: {nice: false},
                    y: {nice: false},
                    padding: {b:40,l:40,t:10,r:10}
                }
            }).renderTo('#chart');
        })
        .catch(e => {
            console.log("Error: ", e);
            $("#results").hide();
            $("#loading").hide();
            $("#error").html(e.responseText).show();
            $("#form").show();
        });
    console.log('run');
}