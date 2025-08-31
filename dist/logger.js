import * as fs from 'fs';
import * as path from 'path';
export class Logger {
    constructor() {
        this.logLevel = 'info';
        this.enableConsole = true;
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    static getLogger(context) {
        const logger = Logger.getInstance();
        if (context) {
            const contextLogger = Object.create(logger);
            contextLogger.context = context;
            return contextLogger;
        }
        return logger;
    }
    configure(options) {
        if (options.level)
            this.logLevel = options.level;
        if (options.console !== undefined)
            this.enableConsole = options.console;
        if (options.file) {
            this.logFile = options.file;
            this.ensureLogDirectory();
        }
    }
    ensureLogDirectory() {
        if (this.logFile) {
            const dir = path.dirname(this.logFile);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
    }
    shouldLog(level) {
        const levels = ['debug', 'info', 'warn', 'error'];
        return levels.indexOf(level) >= levels.indexOf(this.logLevel);
    }
    formatMessage(level, message, metadata) {
        const timestamp = new Date().toISOString();
        const contextStr = this.context ? `[${this.context}] ` : '';
        const metadataStr = metadata ? ` ${JSON.stringify(metadata)}` : '';
        return `${timestamp} [${level.toUpperCase()}] ${contextStr}${message}${metadataStr}`;
    }
    writeLog(level, message, metadata) {
        if (!this.shouldLog(level))
            return;
        const formatted = this.formatMessage(level, message, metadata);
        if (this.enableConsole) {
            const colors = {
                debug: '\x1b[36m',
                info: '\x1b[32m',
                warn: '\x1b[33m',
                error: '\x1b[31m',
            };
            const reset = '\x1b[0m';
            console.log(`${colors[level]}${formatted}${reset}`);
        }
        if (this.logFile) {
            try {
                fs.appendFileSync(this.logFile, formatted + '\n');
            }
            catch (error) {
                console.error('Failed to write to log file:', error);
            }
        }
    }
    debug(message, metadata) {
        this.writeLog('debug', message, metadata);
    }
    info(message, metadata) {
        this.writeLog('info', message, metadata);
    }
    warn(message, metadata) {
        this.writeLog('warn', message, metadata);
    }
    error(message, metadata) {
        this.writeLog('error', message, metadata);
    }
    time(label) {
        console.time(label);
    }
    timeEnd(label) {
        console.timeEnd(label);
    }
}
export const logger = Logger.getInstance();
export const getLogger = Logger.getLogger;
//# sourceMappingURL=logger.js.map