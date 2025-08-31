import * as fs from 'fs'
import * as path from 'path'

interface QdrantConfig {
	url: string
	apiKey?: string
	https?: boolean
	timeout?: number
	retries?: number
}

interface EmbeddingConfig {
	model: string
	dimensions: number
	chunkSize?: number
	chunkOverlap?: number
}

interface WatchingConfig {
	ignorePatterns: string[]
	debounceMs?: number
	enableWatching?: boolean
}

interface ServerConfig {
	port: number
}

interface OllamaConfig {
	host: string
	timeout?: number
	retries?: number
}

interface IndexingConfig {
	batchSize: number
	maxConcurrency: number
	incrementalEnabled: boolean
	persistMetadata: boolean
	validationEnabled: boolean
}

interface LoggingConfig {
	level: 'debug' | 'info' | 'warn' | 'error'
	file?: string
	console: boolean
}

export interface Config {
	qdrant: QdrantConfig
	embedding: EmbeddingConfig
	watching: WatchingConfig
	server: ServerConfig
	ollama: OllamaConfig
	indexing: IndexingConfig
	logging: LoggingConfig
	collectionName: string
	baseDirectory: string
}

/**
 * Detect the base directory (VSCode workspace or current working directory)
 */
function detectBaseDirectory(): string {
	// Try to detect VSCode workspace
	const workspaceFile = process.env.VSCODE_WORKSPACE
	if (workspaceFile && fs.existsSync(workspaceFile)) {
		return path.dirname(workspaceFile)
	}

	// Try environment variable
	const baseDir = process.env.BASE_DIRECTORY
	if (baseDir && fs.existsSync(baseDir)) {
		return path.resolve(baseDir)
	}

	// Use current working directory
	return process.cwd()
}

/**
 * Configuration manager with dynamic reloading capabilities
 */
class ConfigManager {
	private static instance: ConfigManager
	private config: Config | null = null
	private lastLoadTime: number = 0
	private reloadInterval: number = 60000 // 1 minute

	private constructor() {}

	static getInstance(): ConfigManager {
		if (!ConfigManager.instance) {
			ConfigManager.instance = new ConfigManager()
		}
		return ConfigManager.instance
	}

	/**
	 * Load configuration with caching and automatic reloading
	 */
	loadConfig(): Config {
		const now = Date.now()

		// Force reload if config is null or reload interval has passed
		if (!this.config || now - this.lastLoadTime > this.reloadInterval) {
			this.config = this.createConfig()
			this.lastLoadTime = now
		}

		return this.config
	}

	/**
	 * Force reload configuration
	 */
	reloadConfig(): Config {
		this.config = this.createConfig()
		this.lastLoadTime = Date.now()
		return this.config
	}

	/**
	 * Set reload interval in milliseconds
	 */
	setReloadInterval(interval: number): void {
		this.reloadInterval = interval
	}

	/**
	 * Get current configuration
	 */
	getConfig(): Config {
		return this.loadConfig()
	}

	/**
	 * Update base directory (for VSCode workspace detection)
	 */
	updateBaseDirectory(newBaseDirectory: string): void {
		// Force reload with updated base directory
		process.env.BASE_DIRECTORY = newBaseDirectory
		this.reloadConfig()
	}

	/**
	 * Create configuration from environment variables
	 */
	private createConfig(): Config {
		return {
			ollama: {
				host: process.env.OLLAMA_HOST || 'http://localhost:11434',
				timeout: parseInt(process.env.OLLAMA_TIMEOUT || '30000'),
				retries: parseInt(process.env.OLLAMA_RETRIES || '3'),
			},
			qdrant: {
				url: process.env.QDRANT_URL || 'http://localhost:6333',
				apiKey: process.env.QDRANT_API_KEY,
				https: process.env.QDRANT_HTTPS === 'true',
				timeout: parseInt(process.env.QDRANT_TIMEOUT || '30000'),
				retries: parseInt(process.env.QDRANT_RETRIES || '3'),
			},
			embedding: {
				model: process.env.OLLAMA_MODEL || 'nomic-embed-text:v1.5',
				dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768'),
				chunkSize: parseInt(process.env.CHUNK_SIZE || '1000'),
				chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),
			},
			indexing: {
				batchSize: parseInt(process.env.BATCH_SIZE || '10'),
				maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '5'),
				incrementalEnabled: process.env.ENABLE_INCREMENTAL_INDEXING !== 'false',
				persistMetadata: process.env.PERSIST_METADATA !== 'false',
				validationEnabled: process.env.VALIDATION_ENABLED !== 'false',
			},
			watching: {
				ignorePatterns: (
					process.env.IGNORE_PATTERNS ||
					'node_modules/**,*.git/**,dist/**,build/**,*.log,*.tmp'
				).split(','),
				debounceMs: parseInt(process.env.DEBOUNCE_MS || '1000'),
				enableWatching: process.env.WATCH_ENABLED !== 'false',
			},
			logging: {
				level: (process.env.LOG_LEVEL || 'info') as 'debug' | 'info' | 'warn' | 'error',
				file:
					process.env.LOG_FILE_PATH || path.join(process.cwd(), 'logs', 'indexer.log'),
				console: process.env.ENABLE_CONSOLE_LOGGING !== 'false',
			},
			server: {
				port: parseInt(process.env.SERVER_PORT || '3000'),
			},
			baseDirectory: detectBaseDirectory(),
			collectionName: process.env.COLLECTION_NAME || 'code_chunks',
		}
	}
}

/**
 * Loads configuration from environment variables with fallbacks
 * @returns The resolved configuration object
 */
// Legacy function for backward compatibility
export function loadConfig(): Config {
	return ConfigManager.getInstance().loadConfig()
}

// Export ConfigManager class
export { ConfigManager }
