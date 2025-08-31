export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LogEntry {
    timestamp: string;
    level: LogLevel;
    message: string;
    context?: string;
    metadata?: any;
}
export declare class Logger {
    private static instance;
    private logLevel;
    private enableConsole;
    private logFile?;
    private context?;
    private constructor();
    static getInstance(): Logger;
    static getLogger(context?: string): Logger;
    configure(options: {
        level?: LogLevel;
        console?: boolean;
        file?: string;
    }): void;
    private ensureLogDirectory;
    private shouldLog;
    private formatMessage;
    private writeLog;
    debug(message: string, metadata?: any): void;
    info(message: string, metadata?: any): void;
    warn(message: string, metadata?: any): void;
    error(message: string, metadata?: any): void;
    time(label: string): void;
    timeEnd(label: string): void;
}
export declare const logger: Logger;
export declare const getLogger: typeof Logger.getLogger;
//# sourceMappingURL=logger.d.ts.map