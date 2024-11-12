import winston from 'winston'

export const logger = winston.createLogger({
    format: winston.format.combine(
        winston.format.splat(),
        winston.format.timestamp({
            format: 'HH:mm:ss'
        }),
        winston.format.colorize(),
        winston.format.printf(
            log => {
                const {
                    timestamp, level, message, ...args
                } = log;
                let output = `[${timestamp}][${level}]`
                if (args?.process_id) output += `[${args?.process_id}]`
                if (args?.account_id) output += ` ${args?.account_id}:`
                output += ` ${typeof message == 'object' ? JSON.stringify(message) : message}`
                return output
            },
        ),
    ),
    transports: [
        new winston.transports.Console()
    ],
})

