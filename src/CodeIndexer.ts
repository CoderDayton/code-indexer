import { Ollama } from 'ollama'
import * as fsPromises from 'fs/promises'
import * as fs from 'fs'
import * as path from 'path'
import { QdrantClient } from '@qdrant/js-client-rest'
import crypto from 'crypto'
import { glob } from 'glob'
import { Logger, getLogger } from './logger.js'
import { Config } from './env/schema.js'
import { ICodeIndexer } from './ICodeIndexer.js'
import { ExclusionConfigManager } from './config/exclusions.js'
import { FileMatcher } from './config/file-matcher.js'

interface EmbeddingConfig {
	model: string
	dimensions: number
	chunkSize?: number
	chunkOverlap?: number
}

interface FileMetadata {
	filePath: string
	fileSize: number
	lastModified: string
	fileType: string
	checksum: string
	indexed: string
	createdAt: string
	expiresAt?: string
	[key: string]: any
}

interface IndexStats {
	totalFiles: number
	indexedFiles: number
	failedFiles: number
	totalSize: number
	indexedSize: number
	lastIndexed: string
}

interface IncrementalState {
	[filePath: string]: {
		checksum: string
		lastModified: string
		indexed: string
		createdAt: string
		expiresAt?: string
	}
}

/**
 * CodeIndexer with persistence, incremental indexing, and concurrency control
 */
export class CodeIndexer implements ICodeIndexer {
	private qdrantClient: QdrantClient
	private collectionName: string
	private embeddingConfig: EmbeddingConfig
	private ollamaClient: Ollama
	private logger: Logger
	private config: Config
	private freshnessWindowMs: number

	// Lazy purge mechanism
	private lastPurgeTime: number = 0
	private purgeIntervalMs: number = 5 * 60 * 1000 // 5 minutes minimum between purges
	private isPurging: boolean = false

	// Concurrency control
	private indexingQueue: Map<string, Promise<void>> = new Map()
	private maxConcurrency: number
	private currentConcurrency: number = 0

	// Incremental indexing
	private incrementalStateFile: string
	private incrementalState: IncrementalState = {}

	// Metadata persistence
	private metadataFile: string
	private stats: IndexStats

	// Advanced exclusion system
	private exclusionManager: ExclusionConfigManager | null = null
	private fileMatcher: FileMatcher | null = null

	constructor(qdrantClient: QdrantClient, collectionName: string, config: Config) {
		this.qdrantClient = qdrantClient
		this.collectionName = collectionName
		this.embeddingConfig = {
			model: config.ollama.model,
			dimensions: config.embedding.dimensions,
			chunkSize: config.embedding.chunkSize,
			chunkOverlap: config.embedding.chunkOverlap,
		}
		this.config = config
		this.logger = getLogger('CodeIndexer')
		this.maxConcurrency = config.indexing.maxConcurrency

		// Temporal indexing configuration
		this.freshnessWindowMs = (config.indexing.ttlHours ?? 24) * 60 * 60 * 1000

		// Initialize file paths for persistence
		this.incrementalStateFile = path.join(
			config.app.baseDirectory || process.cwd(),
			'.indexer-state.json'
		)
		this.metadataFile = path.join(
			config.app.baseDirectory || process.cwd(),
			'.indexer-metadata.json'
		)

		// Initialize Ollama client with proper configuration and error handling
		try {
			this.ollamaClient = new Ollama({
				host: config.ollama.host,
			})
			this.logger.info('Ollama client initialized', { host: config.ollama.host })
		} catch (error) {
			this.logger.error('Failed to initialize Ollama client', {
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw new Error(
				`Ollama client initialization failed: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}

		// Initialize stats
		this.stats = {
			totalFiles: 0,
			indexedFiles: 0,
			failedFiles: 0,
			totalSize: 0,
			indexedSize: 0,
			lastIndexed: new Date().toISOString(),
		}

		// Load persistent state
		this.loadIncrementalState()
		this.loadMetadata()

		// Initialize advanced exclusion system if enabled (async initialization will happen on first use)
		this.initializeExclusionSystemAsync()
	}

	/**
	 * Initialize advanced exclusion system asynchronously
	 */
	private initializeExclusionSystemAsync(): void {
		// Don't await this - let it initialize in the background
		this.doInitializeExclusionSystem().catch((error) => {
			this.logger.error('Failed to initialize advanced exclusion system', {
				error: error instanceof Error ? error.message : 'Unknown error',
			})
		})
	}

	/**
	 * Initialize advanced exclusion system
	 */
	private async doInitializeExclusionSystem(): Promise<void> {
		if (!this.config.watching.useAdvancedExclusions) {
			this.logger.info('Advanced exclusions disabled, using legacy ignore patterns')
			return
		}

		try {
			const configPath = path.resolve(
				this.config.app.baseDirectory || process.cwd(),
				this.config.watching.exclusionConfigPath
			)

			this.exclusionManager = await ExclusionConfigManager.loadFromFile(configPath)
			this.fileMatcher = new FileMatcher(
				this.exclusionManager,
				this.config.app.baseDirectory || process.cwd()
			)

			this.logger.info('Advanced exclusion system initialized', {
				configPath,
				totalPatterns: this.exclusionManager.getAllExclusionPatterns().length,
			})
		} catch (error) {
			this.logger.error('Failed to initialize advanced exclusion system', {
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			this.logger.info('Falling back to legacy ignore patterns')
		}
	}

	/**
	 * Load incremental state from disk
	 */
	private loadIncrementalState(): void {
		try {
			if (fs.existsSync(this.incrementalStateFile)) {
				const data = fs.readFileSync(this.incrementalStateFile, 'utf-8')
				this.incrementalState = JSON.parse(data)
				this.logger.info('Loaded incremental state', {
					files: Object.keys(this.incrementalState).length,
				})
			}
		} catch (error) {
			this.logger.warn('Failed to load incremental state', {
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			this.incrementalState = {}
		}
	}

	/**
	 * Save incremental state to disk
	 */
	private saveIncrementalState(): void {
		try {
			fs.writeFileSync(
				this.incrementalStateFile,
				JSON.stringify(this.incrementalState, null, 2)
			)
			this.logger.debug('Saved incremental state')
		} catch (error) {
			this.logger.error('Failed to save incremental state', {
				error: error instanceof Error ? error.message : 'Unknown error',
			})
		}
	}

	/**
	 * Load metadata from disk
	 */
	private loadMetadata(): void {
		try {
			if (fs.existsSync(this.metadataFile)) {
				const data = fs.readFileSync(this.metadataFile, 'utf-8')
				this.stats = { ...this.stats, ...JSON.parse(data) }
				this.logger.info('Loaded metadata', this.stats)
			}
		} catch (error) {
			this.logger.warn('Failed to load metadata', {
				error: error instanceof Error ? error.message : 'Unknown error',
			})
		}
	}

	/**
	 * Save metadata to disk
	 */
	private saveMetadata(): void {
		try {
			fs.writeFileSync(this.metadataFile, JSON.stringify(this.stats, null, 2))
			this.logger.debug('Saved metadata')
		} catch (error) {
			this.logger.error('Failed to save metadata', {
				error: error instanceof Error ? error.message : 'Unknown error',
			})
		}
	}

	/**
	 * Generate file checksum for change detection
	 */
	private generateFileChecksum(content: string): string {
		return crypto.createHash('sha256').update(content).digest('hex')
	}

	/**
	 * Check if file should be excluded from indexing
	 */
	private async shouldExcludeFile(filePath: string): Promise<boolean> {
		// Use advanced exclusion system if available
		if (this.fileMatcher) {
			try {
				const result = await this.fileMatcher.shouldExclude(filePath)
				if (result.shouldExclude) {
					this.logger.debug('File excluded by advanced exclusion system', {
						filePath,
						reason: result.reason,
						pattern: result.matchedPattern,
						overridden: result.overridden,
					})
					return true
				}
				return false
			} catch (error) {
				this.logger.warn('Error in advanced exclusion check, falling back to legacy', {
					filePath,
					error: error instanceof Error ? error.message : 'Unknown error',
				})
			}
		}

		// Fallback to legacy ignore patterns
		const relativePath = path.relative(
			this.config.app.baseDirectory || process.cwd(),
			filePath
		)
		for (const pattern of this.config.watching.ignorePatterns) {
			if (
				this.matchLegacyPattern(relativePath, pattern) ||
				this.matchLegacyPattern(path.basename(filePath), pattern)
			) {
				this.logger.debug('File excluded by legacy pattern', { filePath, pattern })
				return true
			}
		}

		return false
	}

	/**
	 * Legacy pattern matching for backward compatibility
	 */
	private matchLegacyPattern(str: string, pattern: string): boolean {
		const regexPattern = pattern
			.replace(/\*\*/g, '.*')
			.replace(/\*/g, '[^/]*')
			.replace(/\?/g, '.')
			.replace(/\./g, '\\.')

		const regex = new RegExp(`^${regexPattern}$`, 'i')
		return regex.test(str)
	}

	/**
	 * Check if file needs to be indexed (incremental indexing)
	 */
	private async needsIndexing(filePath: string): Promise<boolean> {
		if (!this.config.indexing.incrementalEnabled) {
			return true
		}

		try {
			const stats = await fsPromises.stat(filePath)
			const lastModified = stats.mtime.toISOString()

			const existing = this.incrementalState[filePath]
			if (!existing) {
				this.logger.debug('File not in incremental state, needs indexing', { filePath })
				return true
			}

			if (existing.lastModified !== lastModified) {
				this.logger.debug('File modified, needs re-indexing', {
					filePath,
					oldTime: existing.lastModified,
					newTime: lastModified,
				})
				return true
			}

			this.logger.debug('File unchanged, skipping', { filePath })
			return false
		} catch (error) {
			this.logger.error('Error checking file modification time', {
				filePath,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			return true // If we can't determine, better to index
		}
	}

	/**
	 * Generates an embedding for the given text using the configured model
	 */
	async generateEmbedding(text: string): Promise<number[]> {
		const maxRetries = this.config.ollama.retries || 2
		let lastError: Error | null = null

		for (let attempt = 1; attempt <= maxRetries; attempt++) {
			try {
				this.logger.debug('Generating embedding', { attempt, textLength: text.length })

				const response = await this.ollamaClient.embeddings({
					model: this.embeddingConfig.model,
					prompt: text,
				})

				if (!response.embedding || response.embedding.length === 0) {
					throw new Error('Empty embedding response')
				}

				if (response.embedding.length !== this.embeddingConfig.dimensions) {
					const expected = this.embeddingConfig.dimensions
					const actual = response.embedding.length
					this.logger.warn('Embedding dimension mismatch; adjusting vector length', { expected, actual })
					if (actual > expected) {
						response.embedding = response.embedding.slice(0, expected)
					} else {
						response.embedding = response.embedding.concat(new Array(expected - actual).fill(0))
					}
				}

				this.logger.debug('Successfully generated embedding', {
					dimensions: response.embedding.length,
				})
				return response.embedding
			} catch (error) {
				lastError = error instanceof Error ? error : new Error('Unknown error')
				this.logger.warn('Embedding generation failed', {
					attempt,
					maxRetries,
					error: lastError.message,
				})

				if (attempt < maxRetries) {
					const delay = Math.pow(2, attempt) * 1000 // Exponential backoff
					await new Promise((resolve) => setTimeout(resolve, delay))
				}
			}
		}

		throw new Error(
			`Failed to generate embedding after ${maxRetries} attempts: ${lastError?.message}`
		)
	}

	/**
	 * Generates a deterministic UUID for a file path to ensure consistent IDs
	 */
	private generateFileId(filePath: string): string {
		const hash = crypto.createHash('md5').update(filePath).digest('hex')
		return [
			hash.substring(0, 8),
			hash.substring(8, 12),
			'4' + hash.substring(13, 16),
			((parseInt(hash.substring(16, 17), 16) & 0x3) | 0x8).toString(16) +
				hash.substring(17, 20),
			hash.substring(20, 32),
		].join('-')
	}

	/**
	 * Wait for available concurrency slot
	 */
	private async waitForSlot(): Promise<void> {
		while (this.currentConcurrency >= this.maxConcurrency) {
			await new Promise((resolve) => setTimeout(resolve, 100))
		}
		this.currentConcurrency++
	}

	/**
	 * Release concurrency slot
	 */
	private releaseSlot(): void {
		this.currentConcurrency = Math.max(0, this.currentConcurrency - 1)
	}

	/**
	 * Index a single file with enhanced error handling and persistence
	 */
	async indexFile(filePath: string): Promise<void> {
		// Check if already indexing this file
		const existingPromise = this.indexingQueue.get(filePath)
		if (existingPromise) {
			this.logger.debug('File already being indexed, waiting', { filePath })
			return existingPromise
		}

		// Create indexing promise
		const indexingPromise = this.doIndexFile(filePath)
		this.indexingQueue.set(filePath, indexingPromise)

		try {
			await indexingPromise
		} finally {
			this.indexingQueue.delete(filePath)
		}
	}

	/**
	 * Internal file indexing implementation
	 */
	private async doIndexFile(filePath: string): Promise<void> {
		await this.waitForSlot()

		try {
			this.logger.info('Starting file indexing', { filePath })

			// Validate file exists
			if (!fs.existsSync(filePath)) {
				throw new Error(`File does not exist: ${filePath}`)
			}

			// Check if file should be excluded
			if (await this.shouldExcludeFile(filePath)) {
				this.logger.info('File skipped (excluded)', { filePath })
				return
			}

			// Check if indexing is needed (incremental)
			if (!(await this.needsIndexing(filePath))) {
				this.logger.info('File skipped (no changes)', { filePath })
				return
			}

			// Read file content
			const content = await fsPromises.readFile(filePath, 'utf-8')
			const checksum = this.generateFileChecksum(content)

			// Generate embedding
			this.logger.debug('Generating embedding for file', {
				filePath,
				contentLength: content.length,
			})
			const embedding = await this.generateEmbedding(content)

			// Prepare metadata with temporal fields
			const stats = fs.statSync(filePath)
			const nowIso = new Date().toISOString()
			const ttlMs = (this.config.indexing.ttlHours ?? 24) * 60 * 60 * 1000
			const expiresAtIso = new Date(Date.now() + ttlMs).toISOString()
			const metadata: FileMetadata = {
				filePath: filePath,
				fileSize: stats.size,
				lastModified: stats.mtime.toISOString(),
				fileType: path.extname(filePath).substring(1) || 'unknown',
				checksum,
				indexed: nowIso,
				createdAt: nowIso,
				expiresAt: expiresAtIso,
			}

			// Generate deterministic UUID for the file
			const fileId = this.generateFileId(filePath)

			// Persist to Qdrant with retry logic
			const maxRetries = this.config.qdrant.retries || 3
			let lastError: Error | null = null

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					this.logger.debug('Upserting to Qdrant', { filePath, fileId, attempt })

					await this.qdrantClient.upsert(this.collectionName, {
						wait: true, // Ensure persistence
						points: [
							{
								id: fileId,
								vector: embedding,
								payload: metadata,
							},
						],
					})

					this.logger.info('Successfully indexed file', {
						filePath,
						fileId,
						size: stats.size,
					})
					break
				} catch (error) {
					lastError = error instanceof Error ? error : new Error('Unknown error')

					// Enhanced error logging for permission issues
					const isForbidden =
						lastError.message.toLowerCase().includes('forbidden') ||
						(error as any)?.status === 403

					this.logger.warn('Qdrant upsert failed', {
						filePath,
						attempt,
						maxRetries,
						error: lastError.message,
						status: (error as any)?.status,
						isForbidden,
						...(isForbidden && {
							hint: 'Check if API key has write permissions - current error suggests insufficient privileges',
						}),
					})

					if (attempt < maxRetries) {
						const delay = Math.pow(2, attempt) * 1000
						await new Promise((resolve) => setTimeout(resolve, delay))
					}
				}
			}

			if (lastError) {
				throw new Error(
					`Failed to persist to Qdrant after ${maxRetries} attempts: ${lastError.message}`
				)
			}

			// Update incremental state with temporal fields
			this.incrementalState[filePath] = {
				checksum,
				lastModified: metadata.lastModified,
				indexed: metadata.indexed,
				createdAt: metadata.createdAt,
				expiresAt: metadata.expiresAt,
			}

			// Update stats
			this.stats.indexedFiles++
			this.stats.indexedSize += stats.size
			this.stats.lastIndexed = new Date().toISOString()
		} catch (error) {
			this.stats.failedFiles++
			this.logger.error('Failed to index file', {
				filePath,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw new Error(
				`Failed to index file ${filePath}: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		} finally {
			this.releaseSlot()
		}
	}

	/**
	 * Index multiple files with batching and concurrency control
	 */
	async indexFiles(
		filePaths: string[]
	): Promise<{ successful: string[]; failed: string[] }> {
		this.logger.info('Starting batch indexing', { totalFiles: filePaths.length })

		// Reset stats for this batch
		this.stats.totalFiles = filePaths.length
		this.stats.indexedFiles = 0
		this.stats.failedFiles = 0
		this.stats.totalSize = 0
		this.stats.indexedSize = 0

		// Calculate total size
		for (const filePath of filePaths) {
			try {
				const stats = fs.statSync(filePath)
				this.stats.totalSize += stats.size
			} catch (error) {
				this.logger.warn('Could not get file stats', { filePath })
			}
		}

		const results = {
			successful: [] as string[],
			failed: [] as string[],
		}

		// Process files in batches
		const batchSize = this.config.indexing.batchSize
		for (let i = 0; i < filePaths.length; i += batchSize) {
			const batch = filePaths.slice(i, i + batchSize)
			this.logger.info('Processing batch', {
				batch: Math.floor(i / batchSize) + 1,
				totalBatches: Math.ceil(filePaths.length / batchSize),
				filesInBatch: batch.length,
			})

			// Process batch with concurrency control
			const batchPromises = batch.map(async (filePath) => {
				try {
					await this.indexFile(filePath)
					results.successful.push(filePath)
					this.logger.debug('File indexed successfully', { filePath })
				} catch (error) {
					results.failed.push(filePath)
					this.logger.error('File indexing failed', {
						filePath,
						error: error instanceof Error ? error.message : 'Unknown error',
					})
				}
			})

			await Promise.all(batchPromises)
		}

		// Save persistent state
		if (this.config.indexing.persistMetadata) {
			this.saveIncrementalState()
			this.saveMetadata()
		}

		this.logger.info('Batch indexing completed', {
			successful: results.successful.length,
			failed: results.failed.length,
			total: filePaths.length,
		})

		return results
	}

	/**
	 * Search for similar content
	 */
	async search(query: string, limit: number = 5): Promise<any[]> {
		try {
			this.logger.info('Starting search', { query: query.substring(0, 50), limit })

			// Validate index state if enabled
			if (this.config.indexing.validationEnabled) {
				await this.validateIndexState()
			}

			// Generate query embedding
			const queryEmbedding = await this.generateEmbedding(query)

			// Search in Qdrant
			const rawResults = await this.qdrantClient.search(this.collectionName, {
				vector: queryEmbedding,
				limit: Math.max(limit * 2, limit + 5), // fetch extra to allow filtering
				with_payload: true,
			})

			// Temporal filtering: only fresh (within freshnessWindowMs) and not expired
			const now = Date.now()
			const filtered = rawResults.filter((r: any) => {
				const payload = r.payload || {}
				const createdAt =
					typeof payload.createdAt === 'string' ? Date.parse(payload.createdAt) : NaN
				const expiresAt =
					typeof payload.expiresAt === 'string' ? Date.parse(payload.expiresAt) : NaN

				// If invalid createdAt, consider it stale and exclude
				if (!Number.isFinite(createdAt)) return false

				// Exclude if expired
				if (Number.isFinite(expiresAt) && expiresAt < now) return false

				// Exclude if older than freshness window
				if (now - createdAt > this.freshnessWindowMs) return false

				return true
			})

			const finalResults = filtered.slice(0, limit)

			this.logger.info('Search completed', {
				requested: limit,
				resultsCount: finalResults.length,
				filteredOut: rawResults.length - finalResults.length,
				query: query.substring(0, 50),
			})

			// Trigger lazy purge after successful search (non-blocking)
			this.triggerLazyPurge()

			return finalResults
		} catch (error) {
			this.logger.error('Search failed', {
				query: query.substring(0, 50),
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw new Error(
				`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`
			)
		}
	}

	/**
	 * Validate index state
	 */
	async validateIndexState(): Promise<void> {
		try {
			// Check if collection exists
			const collections = await this.qdrantClient.getCollections()
			const collectionExists = collections.collections.some(
				(c) => c.name === this.collectionName
			)

			if (!collectionExists) {
				throw new Error(`Collection ${this.collectionName} does not exist`)
			}

			// Get collection info
			const info = await this.qdrantClient.getCollection(this.collectionName)
			this.logger.debug('Collection validated', {
				pointsCount: info.points_count,
				vectorsConfig: info.config?.params,
			})
		} catch (error) {
			this.logger.error('Index validation failed', {
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw new Error(
				`Index validation failed: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}
	}

	/**
	 * Get indexing statistics
	 */
	getStats(): IndexStats & { incrementalStateSize: number } {
		return {
			...this.stats,
			incrementalStateSize: Object.keys(this.incrementalState).length,
		}
	}

	/**
	 * Get temporal statistics based on incremental state
	 */
	getTemporalStats(): {
		freshEmbeddings: number
		expiredEmbeddings: number
		totalTracked: number
		averageAgeMs: number
		lastPurgeTime: number
		nextPurgeEligibleTime: number
		isPurging: boolean
	} {
		const now = Date.now()
		let fresh = 0
		let expired = 0
		let totalAgeMs = 0
		let ageCount = 0
		const entries = Object.values(this.incrementalState)
		for (const entry of entries) {
			const created =
				typeof entry.createdAt === 'string' ? Date.parse(entry.createdAt) : NaN
			const expires =
				typeof entry.expiresAt === 'string' ? Date.parse(entry.expiresAt) : NaN
			if (Number.isFinite(expires) && expires < now) {
				expired++
				continue
			}
			if (Number.isFinite(created)) {
				const age = now - created
				totalAgeMs += age
				ageCount++
				if (age <= this.freshnessWindowMs) {
					fresh++
				}
			}
		}
		return {
			freshEmbeddings: fresh,
			expiredEmbeddings: expired,
			totalTracked: entries.length,
			averageAgeMs: ageCount > 0 ? Math.round(totalAgeMs / ageCount) : 0,
			lastPurgeTime: this.lastPurgeTime,
			nextPurgeEligibleTime: this.lastPurgeTime + this.purgeIntervalMs,
			isPurging: this.isPurging,
		}
	}

	/**
	 * Trigger lazy purge of expired embeddings (non-blocking)
	 */
	private triggerLazyPurge(): void {
		const now = Date.now()

		// Skip if already purging or too soon since last purge
		if (this.isPurging || now - this.lastPurgeTime < this.purgeIntervalMs) {
			return
		}

		// Run purge in background without blocking search
		this.performLazyPurge().catch((error) => {
			this.logger.error('Background purge failed', {
				error: error instanceof Error ? error.message : 'Unknown error',
			})
		})
	}

	/**
	 * Perform the actual purge operation
	 */
	private async performLazyPurge(): Promise<void> {
		if (this.isPurging) {
			return
		}

		this.isPurging = true
		const startTime = Date.now()

		try {
			this.logger.debug('Starting lazy purge of expired embeddings')

			// Delete expired points from Qdrant using payload filter
			const now = new Date().toISOString()
			const deleteResult = await this.qdrantClient.delete(this.collectionName, {
				wait: true,
				filter: {
					must: [
						{
							key: 'expiresAt',
							range: {
								lt: now,
							},
						},
					],
				},
			})

			// Clean up incremental state for expired entries
			const expiredPaths: string[] = []
			const nowMs = Date.now()

			for (const [filePath, entry] of Object.entries(this.incrementalState)) {
				const expiresAt =
					typeof entry.expiresAt === 'string' ? Date.parse(entry.expiresAt) : NaN
				if (Number.isFinite(expiresAt) && expiresAt < nowMs) {
					expiredPaths.push(filePath)
					delete this.incrementalState[filePath]
				}
			}

			// Save updated incremental state if we removed entries
			if (expiredPaths.length > 0 && this.config.indexing.persistMetadata) {
				this.saveIncrementalState()
			}

			const duration = Date.now() - startTime
			this.lastPurgeTime = Date.now()

			this.logger.info('Lazy purge completed', {
				qdrantOperation: deleteResult.operation_id || 'unknown',
				incrementalStateCleanup: expiredPaths.length,
				durationMs: duration,
			})
		} catch (error) {
			this.logger.error('Lazy purge operation failed', {
				error: error instanceof Error ? error.message : 'Unknown error',
				durationMs: Date.now() - startTime,
			})
		} finally {
			this.isPurging = false
		}
	}

	/**
	 * Clear incremental state (force full re-index next time)
	 */
	clearIncrementalState(): void {
		this.incrementalState = {}
		if (fs.existsSync(this.incrementalStateFile)) {
			fs.unlinkSync(this.incrementalStateFile)
		}
		this.logger.info('Incremental state cleared')
	}

	/**
	 * Get current indexing queue status
	 */
	getIndexingStatus(): {
		queueSize: number
		currentConcurrency: number
		maxConcurrency: number
	} {
		return {
			queueSize: this.indexingQueue.size,
			currentConcurrency: this.currentConcurrency,
			maxConcurrency: this.maxConcurrency,
		}
	}

	/**
	 * Reindex all files in a directory (compatibility method)
	 */
	async reindexAll(directory: string): Promise<void> {
		try {
			this.logger.info('Starting reindex all', { directory })

			// Get all files using the new exclusion system
			const files = await this.getAllFiles(directory)

			if (files.length === 0) {
				this.logger.warn('No files found to index', { directory })
				return
			}

			this.logger.info('Found files to reindex', { count: files.length })

			// Clear incremental state for full reindex
			this.clearIncrementalState()

			// Index all files
			await this.indexFiles(files)

			this.logger.info('Reindex all completed')
		} catch (error) {
			this.logger.error('Reindex all failed', {
				directory,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw error
		}
	}

	/**
	 * Delete file from index (compatibility method)
	 */
	async deleteFileFromIndex(filePath: string): Promise<void> {
		try {
			const fileId = this.generateFileId(filePath)

			await this.qdrantClient.delete(this.collectionName, {
				wait: true,
				points: [fileId],
			})

			// Remove from incremental state
			delete this.incrementalState[filePath]
			this.saveIncrementalState()

			this.logger.info('File deleted from index', { filePath, fileId })
		} catch (error) {
			this.logger.error('Failed to delete file from index', {
				filePath,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw error
		}
	}

	/**
	 * Get all files in directory using advanced exclusion system
	 */
	async getAllFiles(directory: string): Promise<string[]> {
		try {
			this.logger.debug('Getting all files', { directory })

			// Use advanced exclusion system if available
			if (this.fileMatcher) {
				return await this.getAllFilesAdvanced(directory)
			}

			// Fallback to legacy glob-based approach
			const pattern = path.join(directory, '**/*').replace(/\\/g, '/')
			const files = await glob(pattern, {
				nodir: true,
				ignore: this.config.watching.ignorePatterns,
			})

			this.logger.debug('Found files (legacy)', { directory, count: files.length })
			return files
		} catch (error) {
			this.logger.error('Failed to get all files', {
				directory,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			return []
		}
	}

	/**
	 * Get all files using advanced exclusion system
	 */
	private async getAllFilesAdvanced(directory: string): Promise<string[]> {
		const files: string[] = []

		const processDirectory = async (dir: string): Promise<void> => {
			try {
				const entries = await fs.promises.readdir(dir, { withFileTypes: true })

				for (const entry of entries) {
					const fullPath = path.join(dir, entry.name)

					// Check if this path should be excluded
					if (await this.shouldExcludeFile(fullPath)) {
						continue
					}

					if (entry.isDirectory()) {
						await processDirectory(fullPath)
					} else if (entry.isFile()) {
						files.push(fullPath)
					}
				}
			} catch (error) {
				this.logger.warn('Error processing directory', {
					directory: dir,
					error: error instanceof Error ? error.message : 'Unknown error',
				})
			}
		}

		await processDirectory(directory)

		this.logger.debug('Found files (advanced)', { directory, count: files.length })
		return files
	}
}
