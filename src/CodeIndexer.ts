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

	constructor(qdrantClient: QdrantClient, collectionName: string, config: Config) {
		this.qdrantClient = qdrantClient
		this.collectionName = collectionName
		this.embeddingConfig = {
			model: config.ollama.model,
			dimensions: config.embedding.dimensions,
			chunkSize: config.embedding.chunkSize,
			chunkOverlap: config.embedding.chunkOverlap
		}
		this.config = config
		this.logger = getLogger('CodeIndexer')
		this.maxConcurrency = config.indexing.maxConcurrency

		// Initialize file paths for persistence
		this.incrementalStateFile = path.join(config.app.baseDirectory || process.cwd(), '.indexer-state.json')
		this.metadataFile = path.join(config.app.baseDirectory || process.cwd(), '.indexer-metadata.json')

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
					this.logger.warn('Embedding dimension mismatch', {
						expected: this.embeddingConfig.dimensions,
						actual: response.embedding.length,
					})
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

			// Prepare metadata
			const stats = fs.statSync(filePath)
			const metadata: FileMetadata = {
				filePath: filePath,
				fileSize: stats.size,
				lastModified: stats.mtime.toISOString(),
				fileType: path.extname(filePath).substring(1) || 'unknown',
				checksum,
				indexed: new Date().toISOString(),
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
					this.logger.warn('Qdrant upsert failed', {
						filePath,
						attempt,
						maxRetries,
						error: lastError.message,
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

			// Update incremental state
			this.incrementalState[filePath] = {
				checksum,
				lastModified: metadata.lastModified,
				indexed: metadata.indexed,
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
			const searchResult = await this.qdrantClient.search(this.collectionName, {
				vector: queryEmbedding,
				limit,
				with_payload: true,
			})

			this.logger.info('Search completed', {
				resultsCount: searchResult.length,
				query: query.substring(0, 50),
			})

			return searchResult
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

			// Use glob to find all files
			const pattern = path.join(directory, '**/*').replace(/\\/g, '/')
			const files = await glob(pattern, {
				nodir: true,
				ignore: this.config.watching.ignorePatterns,
			})

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
	 * Get all files in directory (compatibility method)
	 */
	async getAllFiles(directory: string): Promise<string[]> {
		try {
			const pattern = path.join(directory, '**/*').replace(/\\/g, '/')
			const files = await glob(pattern, {
				nodir: true,
				ignore: this.config.watching.ignorePatterns,
			})

			this.logger.debug('Found files', { directory, count: files.length })
			return files
		} catch (error) {
			this.logger.error('Failed to get all files', {
				directory,
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			return []
		}
	}
}
