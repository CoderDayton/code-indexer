/**
 * Unified Configuration Manager
 * Combines environment validation and configuration loading into a single system
 */

import { Config, Environment, EnvironmentSchema } from '../env/schema.js'
import { EnvironmentValidator } from '../env/validator.js'
import { EnvironmentLoader } from '../env/loader.js'
import { getLogger } from '../logger.js'

/**
 * Initialization result with detailed feedback
 */
export interface InitializationResult {
	success: boolean
	config?: Config
	validationErrors: Array<{
		field: string
		message: string
		received?: any
		expected?: string
	}>
	troubleshooting: string[]
	environment: {
		nodeEnv: string
		processEnv: Record<string, string | undefined>
		loadedFiles: string[]
	}
}

/**
 * Configuration health status
 */
export interface ConfigHealth {
	healthy: boolean
	lastValidated: Date
	issues: string[]
	environment: {
		varsCount: number
		missingRequired: string[]
		deprecated: string[]
	}
}

/**
 * Unified Configuration Manager
 * Provides centralized configuration management with validation and health monitoring
 */
export class UnifiedConfigManager {
	private static instance: UnifiedConfigManager | null = null
	private config: Config | null = null
	private environment: Environment | null = null
	private health: ConfigHealth | null = null
	private logger = getLogger('UnifiedConfigManager')

	private constructor() {}

	/**
	 * Get the singleton instance
	 */
	public static getInstance(): UnifiedConfigManager {
		if (!UnifiedConfigManager.instance) {
			UnifiedConfigManager.instance = new UnifiedConfigManager()
		}
		return UnifiedConfigManager.instance
	}

	/**
	 * Initialize the configuration system
	 */
	public async initialize(): Promise<InitializationResult> {
		this.logger.info('Initializing unified configuration system')

		try {
			// Load environment variables
			const loader = EnvironmentLoader.getInstance()
			const environmentResult = loader.loadEnvironment()

			// Validate environment variables
			this.environment = EnvironmentValidator.validateOrThrow(process.env)
			this.config = this.transformEnvironmentToConfig(this.environment)

			// Update health status
			this.updateHealthStatus()

			this.logger.info('Configuration system initialized successfully', {
				nodeEnv: this.config.app.nodeEnv,
				qdrantUrl: this.config.qdrant.url,
				ollamaHost: this.config.ollama.host,
				collectionName: this.config.app.collectionName,
			})

			return {
				success: true,
				config: this.config,
				validationErrors: [],
				troubleshooting: [],
				environment: {
					nodeEnv: this.config.app.nodeEnv,
					processEnv: this.sanitizeEnvironment(process.env),
					loadedFiles: environmentResult.loadedFiles,
				},
			}
		} catch (error) {
			this.logger.error('Configuration initialization failed', {
				error: error instanceof Error ? error.message : 'Unknown error',
			})

			// Check if it's a validation error with specific details
			if (error && typeof error === 'object' && 'errors' in error) {
				const validationError = error as {
					errors: Array<{
						field: string
						message: string
						received?: any
						expected?: string
					}>
				}
				return {
					success: false,
					validationErrors: validationError.errors,
					troubleshooting: EnvironmentValidator.generateReport(process.env).split('\n'),
					environment: {
						nodeEnv: process.env.NODE_ENV || 'development',
						processEnv: this.sanitizeEnvironment(process.env),
						loadedFiles: [],
					},
				}
			}

			return {
				success: false,
				validationErrors: [
					{
						field: 'initialization',
						message:
							error instanceof Error ? error.message : 'Unknown initialization error',
					},
				],
				troubleshooting: [
					'Check that all required environment variables are set',
					'Verify that .env file exists and is readable',
					'Ensure environment variable values are in correct format',
				],
				environment: {
					nodeEnv: process.env.NODE_ENV || 'development',
					processEnv: this.sanitizeEnvironment(process.env),
					loadedFiles: [],
				},
			}
		}
	}

	/**
	 * Get the current configuration
	 */
	public getConfig(): Config {
		if (!this.config) {
			throw new Error('Configuration not initialized. Call initialize() first.')
		}
		return this.config
	}

	/**
	 * Get the current environment variables
	 */
	public getEnvironment(): Environment {
		if (!this.environment) {
			throw new Error('Environment not loaded. Call initialize() first.')
		}
		return this.environment
	}

	/**
	 * Get configuration health status
	 */
	public getHealth(): ConfigHealth {
		if (!this.health) {
			throw new Error('Health status not available. Call initialize() first.')
		}
		return this.health
	}

	/**
	 * Transform environment variables to configuration object
	 */
	private transformEnvironmentToConfig(env: Environment): Config {
		return {
			qdrant: {
				url: env.QDRANT_URL,
				apiKey: env.QDRANT_API_KEY,
				https: env.QDRANT_HTTPS,
				timeout: env.QDRANT_TIMEOUT,
				retries: env.QDRANT_RETRIES,
			},
			ollama: {
				host: env.OLLAMA_HOST,
				model: env.OLLAMA_MODEL,
				timeout: env.OLLAMA_TIMEOUT,
				retries: env.OLLAMA_RETRIES,
			},
			embedding: {
				dimensions: env.EMBEDDING_DIMENSIONS,
				chunkSize: env.CHUNK_SIZE,
				chunkOverlap: env.CHUNK_OVERLAP,
			},
			indexing: {
				batchSize: env.BATCH_SIZE,
				maxConcurrency: env.MAX_CONCURRENCY,
				incrementalEnabled: env.ENABLE_INCREMENTAL_INDEXING,
				persistMetadata: env.PERSIST_METADATA,
				validationEnabled: env.VALIDATION_ENABLED,
			},
			watching: {
				ignorePatterns: env.IGNORE_PATTERNS,
				debounceMs: env.DEBOUNCE_MS,
				enableWatching: env.WATCH_ENABLED,
			},
			logging: {
				level: env.LOG_LEVEL,
				file: env.LOG_FILE_PATH,
				console: env.ENABLE_CONSOLE_LOGGING,
			},
			server: {
				port: env.SERVER_PORT,
			},
			app: {
				nodeEnv: env.NODE_ENV,
				baseDirectory: env.BASE_DIRECTORY,
				collectionName: env.COLLECTION_NAME,
			},
		}
	}

	/**
	 * Update health status
	 */
	private updateHealthStatus(): void {
		if (!this.config || !this.environment) {
			return
		}

		const issues: string[] = []
		const missingRequired: string[] = []

		// Check for potential issues
		if (this.config.qdrant.url.includes('localhost')) {
			issues.push('Using localhost Qdrant - ensure Qdrant is running locally')
		}

		if (!this.config.qdrant.apiKey && !this.config.qdrant.url.includes('localhost')) {
			issues.push('No API key provided for remote Qdrant instance')
			missingRequired.push('QDRANT_API_KEY')
		}

		if (this.config.ollama.host.includes('localhost')) {
			issues.push('Using localhost Ollama - ensure Ollama is running locally')
		}

		this.health = {
			healthy: issues.length === 0,
			lastValidated: new Date(),
			issues,
			environment: {
				varsCount: Object.keys(this.environment).length,
				missingRequired,
				deprecated: [],
			},
		}
	}

	/**
	 * Sanitize environment for logging (remove sensitive data)
	 */
	private sanitizeEnvironment(
		env: NodeJS.ProcessEnv
	): Record<string, string | undefined> {
		const sanitized: Record<string, string | undefined> = {}
		const sensitiveKeys = ['QDRANT_API_KEY', 'API_KEY', 'SECRET', 'PASSWORD', 'TOKEN']

		for (const [key, value] of Object.entries(env)) {
			if (sensitiveKeys.some((sensitive) => key.toUpperCase().includes(sensitive))) {
				sanitized[key] = value ? `***${value.slice(-4)}` : undefined
			} else {
				sanitized[key] = value
			}
		}

		return sanitized
	}
}

/**
 * Convenience function to initialize configuration
 */
export async function initializeConfiguration(): Promise<InitializationResult> {
	const manager = UnifiedConfigManager.getInstance()
	return await manager.initialize()
}

/**
 * Convenience function to get configuration manager
 */
export function getConfigManager(): UnifiedConfigManager {
	return UnifiedConfigManager.getInstance()
}
