import { z } from 'zod'

/**
 * Comprehensive environment variable schema using Zod for type-safe validation
 * This schema defines all environment variables used across the application
 */

// Helper schemas for common validations
const URLSchema = z.string().url('Must be a valid URL')
const PortSchema = z.coerce.number().int().min(1024).max(65535)
const PositiveIntSchema = z.coerce.number().int().positive()
const TimeoutSchema = z.coerce.number().int().min(1000).max(300000) // 1s to 5min
const RetrySchema = z.coerce.number().int().min(0).max(10)

// Log level validation
const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])

// Boolean environment variable helper (handles string "true"/"false")
const BooleanEnvSchema = z
	.string()
	.optional()
	.default('false')
	.transform((val) => val.toLowerCase() === 'true')
	.pipe(z.boolean())

const BooleanEnvTrueSchema = z
	.string()
	.optional()
	.default('true')
	.transform((val) => val.toLowerCase() === 'true')
	.pipe(z.boolean())

/**
 * Core Qdrant configuration schema
 */
export const QdrantConfigSchema = z.object({
	QDRANT_URL: URLSchema.describe('Qdrant vector database URL'),
	QDRANT_API_KEY: z
		.string()
		.min(1, 'API key cannot be empty')
		.regex(
			/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/,
			'Invalid API key format - expected JWT format (xxx.yyy.zzz)'
		)
		.describe('Qdrant API key in JWT format'),
	QDRANT_HTTPS: BooleanEnvSchema.describe('Enable HTTPS for Qdrant connection'),
	QDRANT_TIMEOUT: TimeoutSchema.optional()
		.default(30000)
		.describe('Qdrant connection timeout in milliseconds'),
	QDRANT_RETRIES: RetrySchema.optional()
		.default(3)
		.describe('Number of retry attempts for Qdrant operations'),
})

/**
 * Ollama configuration schema
 */
export const OllamaConfigSchema = z.object({
	OLLAMA_HOST: URLSchema.optional()
		.default('http://localhost:11434')
		.describe('Ollama server host URL'),
	OLLAMA_MODEL: z
		.string()
		.min(1)
		.optional()
		.default('nomic-embed-text:v1.5')
		.describe('Ollama embedding model name'),
	OLLAMA_TIMEOUT: TimeoutSchema.optional()
		.default(30000)
		.describe('Ollama request timeout in milliseconds'),
	OLLAMA_RETRIES: RetrySchema.optional()
		.default(3)
		.describe('Number of retry attempts for Ollama operations'),
})

/**
 * Embedding configuration schema
 */
export const EmbeddingConfigSchema = z.object({
	EMBEDDING_DIMENSIONS: PositiveIntSchema.min(1)
		.max(8192)
		.optional()
		.default(768)
		.describe('Embedding vector dimensions'),
	CHUNK_SIZE: PositiveIntSchema.min(100)
		.max(10000)
		.optional()
		.default(1000)
		.describe('Text chunk size for processing'),
	CHUNK_OVERLAP: z.coerce
		.number()
		.int()
		.min(0)
		.max(5000)
		.optional()
		.default(200)
		.describe('Text chunk overlap size'),
})

/**
 * Indexing configuration schema
 */
export const IndexingConfigSchema = z.object({
	BATCH_SIZE: PositiveIntSchema.min(1)
		.max(100)
		.optional()
		.default(10)
		.describe('Batch size for indexing operations'),
	MAX_CONCURRENCY: PositiveIntSchema.min(1)
		.max(20)
		.optional()
		.default(5)
		.describe('Maximum concurrent indexing operations'),
	ENABLE_INCREMENTAL_INDEXING: BooleanEnvTrueSchema.describe(
		'Enable incremental indexing'
	),
	PERSIST_METADATA: BooleanEnvTrueSchema.describe('Persist file metadata'),
	VALIDATION_ENABLED: BooleanEnvTrueSchema.describe('Enable validation during indexing'),
})

/**
 * File watching configuration schema
 */
export const WatchingConfigSchema = z.object({
	IGNORE_PATTERNS: z
		.string()
		.optional()
		.default('node_modules/**,*.git/**,dist/**,build/**,*.log,*.tmp')
		.transform((val) =>
			val
				.split(',')
				.map((p) => p.trim())
				.filter((p) => p.length > 0)
		)
		.describe('Comma-separated list of file patterns to ignore'),
	DEBOUNCE_MS: PositiveIntSchema.min(100)
		.max(10000)
		.optional()
		.default(1000)
		.describe('File watcher debounce time in milliseconds'),
	WATCH_ENABLED: BooleanEnvTrueSchema.describe('Enable file watching'),
})

/**
 * Logging configuration schema
 */
export const LoggingConfigSchema = z.object({
	LOG_LEVEL: LogLevelSchema.optional().default('info').describe('Logging level'),
	LOG_FILE_PATH: z
		.string()
		.optional()
		.describe('Path to log file (optional, defaults to logs/indexer.log)'),
	ENABLE_CONSOLE_LOGGING: BooleanEnvTrueSchema.describe('Enable console logging'),
})

/**
 * Server configuration schema
 */
export const ServerConfigSchema = z.object({
	SERVER_PORT: PortSchema.optional().default(3000).describe('Server port number'),
})

/**
 * Application configuration schema
 */
export const AppConfigSchema = z.object({
	NODE_ENV: z
		.enum(['development', 'test', 'production'])
		.optional()
		.default('development')
		.describe('Node.js environment'),
	BASE_DIRECTORY: z
		.string()
		.optional()
		.describe('Base directory for indexing (optional, auto-detected)'),
	COLLECTION_NAME: z
		.string()
		.min(1)
		.optional()
		.default('code_chunks')
		.describe('Qdrant collection name'),
})

/**
 * Complete environment schema combining all configuration sections
 */
export const EnvironmentSchema = QdrantConfigSchema.merge(OllamaConfigSchema)
	.merge(EmbeddingConfigSchema)
	.merge(IndexingConfigSchema)
	.merge(WatchingConfigSchema)
	.merge(LoggingConfigSchema)
	.merge(ServerConfigSchema)
	.merge(AppConfigSchema)

/**
 * Type inference from the environment schema
 */
export type Environment = z.infer<typeof EnvironmentSchema>

/**
 * Configuration object type (after transformation and defaults)
 */
export type Config = {
	qdrant: {
		url: string
		apiKey: string
		https: boolean
		timeout: number
		retries: number
	}
	ollama: {
		host: string
		model: string
		timeout: number
		retries: number
	}
	embedding: {
		dimensions: number
		chunkSize: number
		chunkOverlap: number
	}
	indexing: {
		batchSize: number
		maxConcurrency: number
		incrementalEnabled: boolean
		persistMetadata: boolean
		validationEnabled: boolean
	}
	watching: {
		ignorePatterns: string[]
		debounceMs: number
		enableWatching: boolean
	}
	logging: {
		level: 'debug' | 'info' | 'warn' | 'error'
		file?: string
		console: boolean
	}
	server: {
		port: number
	}
	app: {
		nodeEnv: 'development' | 'test' | 'production'
		baseDirectory?: string
		collectionName: string
	}
}

/**
 * Validation error details for debugging
 */
export interface ValidationError {
	field: string
	message: string
	received?: any
	expected?: string
}

/**
 * Validation result type
 */
export interface ValidationResult {
	success: boolean
	data?: Environment
	errors?: ValidationError[]
}
