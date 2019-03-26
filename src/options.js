const path = require('path');
const utils = require('./utils');

// TODO
function name2flag(name) {
    return (name.length === 1) ? `-${name}` : `--${name}`;
}

utils.name2flag = name2flag;

class OptionsManager {
    constructor({options, header, footer}) {
        this.options = options;
        this.header = header || '';
        this.footer = footer || '';

        this.map = {};
        for (const option of Object.values(this.options)) {
            for (const flag of option.flags) {
                if (this.map[flag] === undefined) {
                    this.map[flag] = option;
                } else {
                    throw `Error: multiple flags '${utils.name2flag(flag)}'`;
                }
            }
        }

        const requiredOptions = Object.entries(this.options)
            .filter(entry => entry[1].isRequired)
            .map(entry => {
                const [name, option] = entry;
                const flags = option.flags.map(utils.name2flag);
                const args = flags.length > 1 ?
                    ('(' + flags.join('|') + ')') :
                    flags[0];
                return `[${args} <${name}>]`;
            })
            .join(' ');

        this.usage = `Usage: node ${path.basename(__filename)} ${requiredOptions} [options...]`;
    }

    parse(args) {
        const parsedOptions = utils.argParse(args);
        for (const [flag, value] of Object.entries(parsedOptions)) {
            if (this.map[flag].value === undefined) {
                this.map[flag].value = value;
            } else {
                throw `Error: multiple definition of flag ${utils.name2flag(flag)}`;
            }
        }
    }

    get(name) {
        const option = this.options[name];
        const value = option.value;
        if (value !== undefined) {
            return value;
        } else {
            const flags = option.flags.map(utils.name2flag).join(', ');
            throw `Error: no value defined for '${name}' (flags: [${flags}])`;
        }
    }

    toString() {
        const optionsString = Object.values(this.options)
            .map(option => option.toString())
            .join('\n');
        return [
                this.usage, this.header, optionsString, this.footer
            ].filter(s => s.length > 0)
             .join('\n\n');
    }
}

class Option {
    constructor({flags, desc, isRequired}) {
        this.flags = (typeof flags === 'string') ? [flags] : flags;
        this.desc = desc;
        this.isRequired = isRequired || false;

        this.value = undefined; //null?
    }

    toString() {
        const flagsString = this.flags
            .map(f => (f.length === 1) ? `-${f}` : `--${f}`)
            .join(', ') + ':\n';
        const descString = `\t${this.desc}`;
        return flagsString + descString;
    }
}
/*
Usage:  node app.js [--url <url>] [options...]

-h, --help          : Print command line options
-u, --url <url>     : GitHub project url
--no-clone          : Don't clone repository
-o, --out <file>    : Optional output file to output results
-a, --append        : Append to file if exists (and output file specified)

Documentation can be found at:
https://github.com/pjmc-oliveira/HubListener
*/

const options = new OptionsManager({
    footer: 'Documentation can be found at:\n' +
            'https://github.com/pjmc-oliveira/HubListener',
    options: {
        'help': new Option({
            desc: 'Print command line options',
            flags: ['h', 'help']
        }),
        'url': new Option({
            desc: 'GitHub project url',
            flags: ['u', 'url'],
            isRequired: true
        }),
        'no-clone': new Option({
            desc: 'Don\'t clone repository',
            flags: ['no-clone']
        }),
        'out': new Option({
            desc: 'Optional output file to output results',
            flags: ['o', 'out']
        }),
        'append': new Option({
            desc: 'Append to file if exists (and output file specified)',
            flags: ['a', 'append']
        }),
    }
});

console.log(options.toString());