import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { z } from 'zod'
import { QdrantClient } from '@qdrant/js-client-rest'
import { CodeIndexer } from './CodeIndexer.js'
import { FileWatcher } from './FileWatcher.js'
import { Config, ConfigManager } from './config.js'
import { Logger, getLogger } from './logger.js'

interface StatusResponse {
	watching: boolean
	collectionName: string
	qdrantUrl: string
	embeddingModel: string
	serverPort: number
	qdrantConnected: boolean
	ollamaHost: string
}

/**
 * CodeIndexerServer provides an MCP interface for the code indexing functionality
 *
 * This class is responsible for:
 * 1. Managing the MCP server
 * 2. Coordinating indexing and search operations
 * 3. Providing MCP-compatible tools
 * 4. Managing file watching
 *
 * @author malu
 */
export class CodeIndexerServer {
	private config: Config
	private configManager: ConfigManager
	private qdrantClient: QdrantClient
	private collectionName: string
	private indexer: CodeIndexer
	private watcher: FileWatcher
	private mcpServer: McpServer
	private transport: StreamableHTTPServerTransport
	private logger: Logger

	constructor(config?: Config) {
		// Initialize configuration management
		this.configManager = ConfigManager.getInstance()
		this.config = config || this.configManager.loadConfig()
		this.collectionName = this.config.collectionName

		// Initialize logger
		this.logger = getLogger('CodeIndexerServer')
		this.logger.configure({
			level: this.config.logging.level,
			console: this.config.logging.console,
			file: this.config.logging.file,
		})

		// Initialize QdrantClient with proper configuration and enhanced error handling
		try {
			this.logger.info('Initializing Qdrant client', { url: this.config.qdrant.url })

			const qdrantConfig: any = {
				url: this.config.qdrant.url,
			}

			// Add API key if provided
			if (this.config.qdrant.apiKey) {
				qdrantConfig.apiKey = this.config.qdrant.apiKey
			}

			this.qdrantClient = new QdrantClient(qdrantConfig)
			this.logger.info('Qdrant client initialized successfully')
		} catch (error) {
			this.logger.error('Failed to initialize Qdrant client', {
				error: error instanceof Error ? error.message : 'Unknown error',
				url: this.config.qdrant.url,
				hasApiKey: !!this.config.qdrant.apiKey,
			})
			throw new Error(
				`Qdrant client initialization failed: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}

		// Initialize CodeIndexer with enhanced features
		try {
			this.indexer = new CodeIndexer(this.qdrantClient, this.collectionName, this.config)
			this.logger.info('CodeIndexer initialized successfully')
		} catch (error) {
			this.logger.error('Failed to initialize Enhanced CodeIndexer', {
				error: error instanceof Error ? error.message : 'Unknown error',
			})
			throw new Error(
				`Enhanced CodeIndexer initialization failed: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}

		this.watcher = new FileWatcher(this.indexer, this.config.watching)

		// Create MCP server
		this.mcpServer = new McpServer({
			name: 'code-indexer',
			version: '1.0.0',
		})

		// Set up transport
		this.transport = new StreamableHTTPServerTransport({
			sessionIdGenerator: () => Math.random().toString(36).substring(2, 15),
			enableJsonResponse: true,
		})

		this.setupTools()
	}

	/**
	 * Sets up MCP tools
	 */
	private setupTools(): void {
		// Index specific files tool
		this.mcpServer.registerTool(
			'index_specific_files',
			{
				description: 'Index specific files in the codebase',
				inputSchema: {
					filePaths: z.array(z.string()).describe('Array of file paths to index'),
				},
			},
			async ({ filePaths }) => {
				try {
					if (!Array.isArray(filePaths)) {
						return {
							content: [],
							isError: true,
							error: { type: 'invalid_request', message: 'filePaths must be an array' },
						}
					}

					if (filePaths.length === 0) {
						return {
							content: [],
							isError: true,
							error: {
								type: 'invalid_request',
								message: 'filePaths array cannot be empty',
							},
						}
					}

					await this.indexSpecificFiles(filePaths)
					return {
						content: [
							{ type: 'text', text: `Successfully indexed ${filePaths.length} files` },
						],
					}
				} catch (error) {
					console.error('Error indexing files:', error)
					return {
						content: [],
						isError: true,
						error: {
							type: 'internal_error',
							message: error instanceof Error ? error.message : 'Unknown error',
						},
					}
				}
			}
		)

		// Retrieve data tool (search)
		this.mcpServer.registerTool(
			'retrieve_data',
			{
				description: 'Search for code using a natural language query',
				inputSchema: {
					query: z.string().describe('The search query'),
					topK: z
						.number()
						.optional()
						.describe('Number of results to return (default: 10)'),
				},
			},
			async ({ query, topK }) => {
				try {
					if (!query || query.trim().length === 0) {
						return {
							content: [],
							isError: true,
							error: { type: 'invalid_request', message: 'Query cannot be empty' },
						}
					}

					const results = await this.retrieveData(query, topK || 10)
					return {
						content: [
							{
								type: 'text',
								text: `Found ${results.length} results:\\n${JSON.stringify(
									results,
									null,
									2
								)}`,
							},
						],
					}
				} catch (error) {
					console.error('Error retrieving data:', error)
					return {
						content: [],
						isError: true,
						error: {
							type: 'internal_error',
							message: error instanceof Error ? error.message : 'Unknown error',
						},
					}
				}
			}
		)

		// Reindex all tool
		this.mcpServer.registerTool(
			'reindex_all',
			{
				description: 'Reindex the entire codebase in the specified directory',
				inputSchema: {
					directory: z
						.string()
						.optional()
						.describe('The directory to reindex (default: current directory)'),
				},
			},
			async ({ directory }) => {
				try {
					const targetDir = directory || './'
					await this.reindexAll(targetDir)
					return {
						content: [
							{ type: 'text', text: `Successfully reindexed all files in ${targetDir}` },
						],
					}
				} catch (error) {
					console.error('Error reindexing:', error)
					return {
						content: [],
						isError: true,
						error: {
							type: 'internal_error',
							message: error instanceof Error ? error.message : 'Unknown error',
						},
					}
				}
			}
		)

		// Get status tool
		this.mcpServer.registerTool(
			'get_status',
			{
				description: 'Get the current status of the indexer',
			},
			async () => {
				try {
					const status = await this.getStatus()
					return {
						content: [
							{
								type: 'text',
								text: `Status:\\n${JSON.stringify(status, null, 2)}`,
							},
						],
					}
				} catch (error) {
					console.error('Error getting status:', error)
					return {
						content: [],
						isError: true,
						error: {
							type: 'internal_error',
							message: error instanceof Error ? error.message : 'Unknown error',
						},
					}
				}
			}
		)

		// Start watching tool
		this.mcpServer.registerTool(
			'start_watching',
			{
				description: 'Start watching a directory for file changes',
				inputSchema: {
					directory: z
						.string()
						.optional()
						.describe('The directory to watch (default: current directory)'),
				},
			},
			async ({ directory }) => {
				try {
					this.startWatching(directory || './')
					return {
						content: [{ type: 'text', text: 'Started watching' }],
					}
				} catch (error) {
					console.error('Error starting watch:', error)
					return {
						content: [],
						isError: true,
						error: {
							type: 'internal_error',
							message: error instanceof Error ? error.message : 'Unknown error',
						},
					}
				}
			}
		)

		// Stop watching tool
		this.mcpServer.registerTool(
			'stop_watching',
			{
				description: 'Stop watching for file changes',
			},
			async () => {
				try {
					this.stopWatching()
					return {
						content: [{ type: 'text', text: 'Stopped watching' }],
					}
				} catch (error) {
					console.error('Error stopping watch:', error)
					return {
						content: [],
						isError: true,
						error: {
							type: 'internal_error',
							message: error instanceof Error ? error.message : 'Unknown error',
						},
					}
				}
			}
		)
	}

	/**
	 * Initializes the server by creating the collection if it doesn't exist
	 * @throws Error if initialization fails
	 */
	async initialize(): Promise<void> {
		try {
			console.log('Initializing CodeIndexer server...')

			// Test Qdrant connection first
			try {
				console.log('Testing Qdrant connection...')
				await this.qdrantClient.getCollections()
				console.log('✓ Qdrant connection successful')
			} catch (error: any) {
				console.error('✗ Qdrant connection failed:', error)
				if (error?.status === 401) {
					throw new Error('Qdrant authentication failed. Please check your API key.')
				} else if (error?.code === 'ECONNREFUSED') {
					throw new Error(
						'Cannot connect to Qdrant server. Please check if Qdrant is running and the URL is correct.'
					)
				} else {
					throw new Error(`Qdrant connection error: ${error.message || 'Unknown error'}`)
				}
			}

			// Create collection if it doesn't exist
			try {
				console.log(`Checking if collection '${this.collectionName}' exists...`)
				await this.qdrantClient.getCollection(this.collectionName)
				console.log(`✓ Collection '${this.collectionName}' already exists`)
			} catch (error: any) {
				// Collection doesn't exist, create it
				if (error?.status === 404) {
					console.log(`Creating collection '${this.collectionName}'...`)
					await this.qdrantClient.createCollection(this.collectionName, {
						vectors: {
							size: this.config.embedding.dimensions,
							distance: 'Cosine',
						},
					})
					console.log(`✓ Collection '${this.collectionName}' created successfully`)
				} else {
					throw error
				}
			}

			console.log('✓ CodeIndexer server initialized successfully')
		} catch (error) {
			console.error('✗ Error initializing server:', error)
			throw new Error(
				`Failed to initialize server: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}
	}

	/**
	 * Indexes specific files
	 * @param filePaths Array of file paths to index
	 * @throws Error if indexing fails
	 */
	async indexSpecificFiles(filePaths: string[]): Promise<void> {
		try {
			if (!Array.isArray(filePaths)) {
				throw new Error('filePaths must be an array')
			}

			await this.indexer.indexFiles(filePaths)
		} catch (error) {
			console.error('Error indexing specific files:', error)
			throw new Error(
				`Failed to index specific files: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}
	}

	/**
	 * Retrieves data matching the query
	 * @param query The search query
	 * @param topK Number of results to return (default: 10)
	 * @returns Search results
	 * @throws Error if search fails
	 */
	async retrieveData(query: string, topK: number = 10): Promise<any[]> {
		try {
			return await this.indexer.search(query, topK)
		} catch (error) {
			console.error('Error retrieving data:', error)
			throw new Error(
				`Failed to retrieve data: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}
	}

	/**
	 * Reindexes all files in a directory
	 * @param directory The directory to reindex (default: current directory)
	 * @throws Error if reindexing fails
	 */
	async reindexAll(directory: string = './'): Promise<void> {
		try {
			await this.indexer.reindexAll(directory)
		} catch (error) {
			console.error('Error reindexing all files:', error)
			throw new Error(
				`Failed to reindex all files: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}
	}

	/**
	 * Gets the current status of the indexer
	 * @returns Status information
	 * @throws Error if status check fails
	 */
	async getStatus(): Promise<StatusResponse> {
		try {
			// Test Qdrant connection
			let qdrantConnected = false
			try {
				await this.qdrantClient.getCollections()
				qdrantConnected = true
			} catch (error) {
				console.warn('Qdrant connection test failed:', error)
				qdrantConnected = false
			}

			return {
				watching: this.watcher.isWatching(),
				collectionName: this.collectionName,
				qdrantUrl: this.config.qdrant.url,
				embeddingModel: this.config.embedding.model,
				serverPort: this.config.server.port,
				qdrantConnected,
				ollamaHost: this.config.ollama.host,
			}
		} catch (error) {
			console.error('Error getting status:', error)
			throw new Error(
				`Failed to get status: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}
	}

	/**
	 * Starts watching a directory for file changes
	 * @param directory The directory to watch
	 * @throws Error if starting watch fails
	 */
	startWatching(directory: string): void {
		try {
			this.watcher.startWatching(directory)
		} catch (error) {
			console.error('Error starting watch:', error)
			throw new Error(
				`Failed to start watch: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}
	}

	/**
	 * Stops watching for file changes
	 * @throws Error if stopping watch fails
	 */
	stopWatching(): void {
		try {
			this.watcher.stopWatching()
		} catch (error) {
			console.error('Error stopping watch:', error)
			throw new Error(
				`Failed to stop watch: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}
	}

	/**
	 * Starts the MCP server
	 * @throws Error if server fails to start
	 */
	async startServer(): Promise<void> {
		try {
			// Connect the server to the transport
			await this.mcpServer.connect(this.transport)

			console.log(`Code Indexer MCP Server listening on port ${this.config.server.port}`)
			console.log(`MCP endpoint: http://localhost:${this.config.server.port}/mcp`)
		} catch (error) {
			console.error('Error starting server:', error)
			throw new Error(
				`Failed to start server: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}
	}

	/**
	 * Stops the MCP server
	 */
	async stopServer(): Promise<void> {
		try {
			await this.mcpServer.close()
			console.log('Server closed')
		} catch (error) {
			console.error('Error closing server:', error)
		}
	}
}
