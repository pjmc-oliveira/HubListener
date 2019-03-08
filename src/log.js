
const path = require('path');
const { createLogger, format, transports } = require('winston');

const formatter = format.printf(({level, message, timestamp, label}) => {
        message = typeof message === 'string' ? message : JSON.stringify(message, null, 4);
        return `${timestamp} [${label}] ${level.toUpperCase()}: ${message}`;
    }
);

const mkLogger = ({label = 'HubListener', level = 'debug'}) => (
    createLogger({
        level: level,
        format: format.combine(
            format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss.SSS'
            }),
            format.errors({ stack: true }),
            format.splat(),
            format.json(),
            formatter
        ),
        defaultMeta: { label: path.basename(label) },
        transports: [
            new transports.Console({
                format: format.combine(
                    format.colorize()
                )
            }),
            new transports.File({
                filename: './logs/debug.log',
                level: 'debug',
            }),
            new transports.File({
                filename: './logs/info.log',
                level: 'info',
            }),
            new transports.File({
                filename: './logs/error.log',
                level: 'error',
            })
        ]
    })
);

module.exports = mkLogger;