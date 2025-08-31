import { CodeIndexer } from '../CodeIndexer.js'
import { QdrantClient } from '@qdrant/js-client-rest'
import { Config } from '../config.js'

// Mock QdrantClient
jest.mock('@qdrant/js-client-rest')

describe('CodeIndexer', () => {
	let indexer: CodeIndexer
	let mockQdrantClient: jest.Mocked<QdrantClient>
	let mockConfig: Config

	beforeEach(() => {
		mockQdrantClient = new QdrantClient() as jest.Mocked<QdrantClient>

		mockConfig = {
			qdrant: {
				url: 'http://localhost:6333',
				timeout: 30000,
				retries: 3,
			},
			embedding: {
				model: 'nomic-embed-text:latest',
				dimensions: 768,
				chunkSize: 1000,
				chunkOverlap: 200,
			},
			indexing: {
				batchSize: 10,
				maxConcurrency: 5,
				incrementalEnabled: true,
				persistMetadata: true,
				validationEnabled: true,
			},
			watching: {
				ignorePatterns: ['node_modules/**', '*.git/**'],
				debounceMs: 1000,
				enableWatching: true,
			},
			logging: {
				level: 'info',
				file: './logs/test.log',
				console: true,
			},
			server: {
				port: 3000,
			},
			ollama: {
				host: 'http://localhost:11434',
				timeout: 30000,
				retries: 3,
			},
			baseDirectory: process.cwd(),
			collectionName: 'test_collection',
		}

		indexer = new CodeIndexer(mockQdrantClient, 'test_collection', mockConfig)
	})

	describe('Configuration', () => {
		it('should initialize with correct configuration', () => {
			expect(indexer).toBeDefined()
			expect(indexer.getIndexingStatus).toBeDefined()
		})

		it('should provide indexing status', () => {
			const status = indexer.getIndexingStatus()
			expect(status).toHaveProperty('queueSize')
			expect(status).toHaveProperty('currentConcurrency')
			expect(status).toHaveProperty('maxConcurrency')
			expect(typeof status.queueSize).toBe('number')
			expect(typeof status.currentConcurrency).toBe('number')
			expect(typeof status.maxConcurrency).toBe('number')
		})
	})

	describe('Interface Implementation', () => {
		it('should implement ICodeIndexer interface', () => {
			// Test that all required methods exist
			expect(typeof indexer.indexFile).toBe('function')
			expect(typeof indexer.indexFiles).toBe('function')
			expect(typeof indexer.search).toBe('function')
			expect(typeof indexer.reindexAll).toBe('function')
			expect(typeof indexer.deleteFileFromIndex).toBe('function')
			expect(typeof indexer.getAllFiles).toBe('function')
		})
	})

	describe('Error Handling', () => {
		it('should handle missing files gracefully', async () => {
			await expect(indexer.getAllFiles('/nonexistent/path')).resolves.toEqual([])
		})
	})
})
