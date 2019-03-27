let chart;
let chartData;
let chartConfig;

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form');
    form.addEventListener('submit', submitForm);
});

function ajax(method, url, json) {
    return new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                resolve(JSON.parse(xhr.response));
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

function updateChart() {
    // Need to reinstantiate the quick filter plugin due to a bug in taucharts updateConfig implementation
    chartConfig.plugins[0] = Taucharts.api.plugins.get('quick-filter')(['commit_date']);
    chart.updateConfig(chartConfig);
}

function submitForm(event) {
    event.preventDefault();
    $("#form").hide();
    $("#loading").show();
    const json = form2json(event.target);
    ajax("POST", "/analyse", json)
        .then(x => {
            // Make any necessary transformations to the parsed JSON results
            for (data of x.points) {
                // Parse dates into date objects
                data['commit_date'] = new Date(data['commit_date']);
            }

            chartData = x.points;

            $("#loading").hide();
            $("#results").show();

            // First time / default config
            chartConfig = {
                data: chartData,
                type: 'line',
                x: 'commit_date',
                y: 'numberOfFiles',
                color: 'file_extension',
                guide: {
                x: {nice: true},
                y: {nice: true},
                padding: {b:40,l:40,t:10,r:10}
            },
                plugins: [
                    Taucharts.api.plugins.get('quick-filter')(['commit_date']),
                    Taucharts.api.plugins.get('tooltip')(),
                    Taucharts.api.plugins.get('legend')()
                ]
            };

            chart = new Taucharts.Chart(chartConfig);
            chart.renderTo("#chart");

            let xSelect = $("#x-axis");
            let ySelect = $("#y-axis");

            for (let prop in chartData[0]) {
                xSelect.append($('<option>', {value: prop, text: prop}));
                ySelect.append($('<option>', {value: prop, text: prop}));
            }

            xSelect.val('commit_date');
            ySelect.val('numberOfFiles');

            xSelect.on('change', e => {
                chartConfig.x = xSelect.val();
                updateChart();
            });

            ySelect.on('change', e => {
                chartConfig.y = ySelect.val();
                updateChart();
            });
        })
        .catch(e => {
            console.log("Error: ", e);
            $("#results").hide();
            $("#loading").hide();
            $("#error").html(e.responseText).show();
            $("#form").show();
        });
}