let chart;
let barchart;
let chartData;
let barchartData;
let chartConfig;

document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('form');
    form.addEventListener('submit', submitForm);
    loadView('main');
});

function loadView(viewName) {
    let views = document.getElementsByClassName('view');
    for (const view of views) {
        if (view.id === viewName) {
            view.style.display = 'block';
        } else {
            view.style.display = 'none';
        }
    }
}

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
        if (input.type !== 'submit') {
            if (input.type === 'checkbox') {
                result[input.name] = form[input.name].checked;
            } else {
                result[input.name] = form[input.name].value;
            }
        }
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

    // Hide form controls and display loading spinner and progress text
    loadView('loading');
    const json = form2json(event.target);
    ajax("POST", "/analyse", json)
        .then(x => {
            // Make any necessary transformations to the parsed JSON results
            for (data of x.points) {
                // Parse dates into date objects
                data['commit_date'] = new Date(data['commit_date']);
            }

            chartData = x.points;
            barchartData = [
                {name: 'issues', value: x.issues.length},
                {name: 'forks', value: x.forks},
                {name: 'pull requests', value: x.pulls.length}
            ];

            // Hide loading spinner and display results div
            // Must unhide results div before rendering chart to ensure chart is rendered at the correct resolution
            loadView('results');

            // First time / default tauchart config
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
                    Taucharts.api.plugins.get('quick-filter')(['commit_date']), // quick-filter must be plugin 0
                    Taucharts.api.plugins.get('tooltip')(),
                    Taucharts.api.plugins.get('legend')()
                ]
            };

            chart = new Taucharts.Chart(chartConfig);
            chart.renderTo("#chart");

            barchart = new Taucharts.Chart({
                data: barchartData,
                type: 'bar',
                x: 'name',
                y: 'value',
                plugins: [
                    Taucharts.api.plugins.get('tooltip')(),
                    Taucharts.api.plugins.get('legend')()
                ]
            });
            barchart.renderTo("#barchart");

            let xSelect = $("#x-axis");
            let ySelect = $("#y-axis");

            // Populate x/y select dropdowns
            for (let prop in chartData[0]) {
                xSelect.append($('<option>', {value: prop, text: prop}));
                ySelect.append($('<option>', {value: prop, text: prop}));
            }

            // Set default values for x/y select dropdowns
            xSelect.val('commit_date');
            ySelect.val('numberOfFiles');

            // Wire onchange events for x/y select dropdowns
            xSelect.on('change', e => {
                chartConfig.x = xSelect.val();
                updateChart();
            });

            ySelect.on('change', e => {
                chartConfig.y = ySelect.val();
                updateChart();
            });

            // Wire export button
            $("#export").on('click', e => {
                let data = JSON.stringify(chartData, null, 4);

                let blob = new Blob([data], {type: 'application/json'});
                let url = URL.createObjectURL(blob);

                let element = document.createElement('a');
                element.setAttribute('href', url);
                element.setAttribute('download', 'data.json');

                element.style.display = 'none';
                document.body.appendChild(element);

                element.click();

                document.body.removeChild(element);
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