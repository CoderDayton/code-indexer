import * as fs from 'fs'
import * as path from 'path'

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogEntry {
	timestamp: string
	level: LogLevel
	message: string
	context?: string
	metadata?: any
}

/**
 * Logging system with file and console output
 */
export class Logger {
	private static instance: Logger
	private logLevel: LogLevel = 'info'
	private enableConsole: boolean = true
	private logFile?: string
	private context?: string

	private constructor() {}

	public static getInstance(): Logger {
		if (!Logger.instance) {
			Logger.instance = new Logger()
		}
		return Logger.instance
	}

	public static getLogger(context?: string): Logger {
		const logger = Logger.getInstance()
		if (context) {
			const contextLogger = Object.create(logger)
			contextLogger.context = context
			return contextLogger
		}
		return logger
	}

	public configure(options: {
		level?: LogLevel
		console?: boolean
		file?: string
	}): void {
		if (options.level) this.logLevel = options.level
		if (options.console !== undefined) this.enableConsole = options.console
		if (options.file) {
			this.logFile = options.file
			this.ensureLogDirectory()
		}
	}

	private ensureLogDirectory(): void {
		if (this.logFile) {
			const dir = path.dirname(this.logFile)
			if (!fs.existsSync(dir)) {
				fs.mkdirSync(dir, { recursive: true })
			}
		}
	}

	private shouldLog(level: LogLevel): boolean {
		const levels: LogLevel[] = ['debug', 'info', 'warn', 'error']
		return levels.indexOf(level) >= levels.indexOf(this.logLevel)
	}

	private formatMessage(level: LogLevel, message: string, metadata?: any): string {
		const timestamp = new Date().toISOString()
		const contextStr = this.context ? `[${this.context}] ` : ''
		const metadataStr = metadata ? ` ${JSON.stringify(metadata)}` : ''
		return `${timestamp} [${level.toUpperCase()}] ${contextStr}${message}${metadataStr}`
	}

	private writeLog(level: LogLevel, message: string, metadata?: any): void {
		if (!this.shouldLog(level)) return

		const formatted = this.formatMessage(level, message, metadata)

		// Console output
		if (this.enableConsole) {
			const colors = {
				debug: '\x1b[36m', // Cyan
				info: '\x1b[32m', // Green
				warn: '\x1b[33m', // Yellow
				error: '\x1b[31m', // Red
			}
			const reset = '\x1b[0m'
			console.log(`${colors[level]}${formatted}${reset}`)
		}

		// File output
		if (this.logFile) {
			try {
				fs.appendFileSync(this.logFile, formatted + '\n')
			} catch (error) {
				console.error('Failed to write to log file:', error)
			}
		}
	}

	public debug(message: string, metadata?: any): void {
		this.writeLog('debug', message, metadata)
	}

	public info(message: string, metadata?: any): void {
		this.writeLog('info', message, metadata)
	}

	public warn(message: string, metadata?: any): void {
		this.writeLog('warn', message, metadata)
	}

	public error(message: string, metadata?: any): void {
		this.writeLog('error', message, metadata)
	}

	public time(label: string): void {
		console.time(label)
	}

	public timeEnd(label: string): void {
		console.timeEnd(label)
	}
}

// Convenience functions
export const logger = Logger.getInstance()
export const getLogger = Logger.getLogger
