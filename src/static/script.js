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
    $("#results").show();
    const json = form2json(event.target);
    ajax("POST", "/run", json)
        .then(x => console.log(x))
        .catch(e => {
            console.log("Error: ", e);
            $("#results").hide();
            $("#error").html(e.responseText).show();
        });
    console.log('run');
}