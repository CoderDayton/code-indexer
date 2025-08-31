import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
	ListToolsRequestSchema,
	CallToolRequestSchema,
	ErrorCode,
	McpError,
} from '@modelcontextprotocol/sdk/types.js'
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
	private mcpServer: Server
	private transport: StdioServerTransport
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

			const key = this.config.qdrant.apiKey

			// Add API key if provided
			if (key) {
				const validKey = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(key)
				if (!validKey) {
					this.logger.error(
						'Invalid Qdrant API key format - expected JWT format (xxx.yyy.zzz)'
					)
					throw new Error(
						'Invalid Qdrant API key format. Expected JWT format with three base64 segments separated by dots.'
					)
				}
				qdrantConfig.apiKey = key
				this.logger.info('Qdrant API key loaded and validated successfully')
			} else if (process.env.QDRANT_API_KEY) {
				const envKey = process.env.QDRANT_API_KEY
				const validEnvKey = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(
					envKey
				)
				if (!validEnvKey) {
					this.logger.error(
						'Invalid Qdrant API key format from environment - expected JWT format (xxx.yyy.zzz)'
					)
					throw new Error(
						'Invalid Qdrant API key format from environment. Expected JWT format with three base64 segments separated by dots.'
					)
				}
				qdrantConfig.apiKey = envKey
				this.logger.info(
					'Qdrant API key loaded from environment and validated successfully'
				)
			} else {
				this.logger.error(
					'No Qdrant API key found in configuration or environment variables'
				)
				throw new Error(
					'No Qdrant API key provided. Please set QDRANT_API_KEY in your environment or MCP client configuration.'
				)
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

		// Create MCP server with stdio capabilities
		this.mcpServer = new Server(
			{
				name: 'code-indexer',
				version: '1.0.3',
			},
			{
				capabilities: {
					tools: {
						supported: true,
						// List of available tools
						available: [
							'index_specific_files',
							'retrieve_data',
							'reindex_all',
							'start_watching',
							'stop_watching',
							'get_status',
						],
					},
				},
			}
		)

		// Set up transport
		this.transport = new StdioServerTransport()

		this.setupTools()
	}

	/**
	 * Sets up MCP tools using stdio transport
	 */
	private setupTools(): void {
		// Set up tool list handler
		this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
			return {
				tools: [
					{
						name: 'index_specific_files',
						description: 'Index specific files in the codebase',
						inputSchema: {
							type: 'object',
							properties: {
								filePaths: {
									type: 'array',
									items: { type: 'string' },
									description: 'Array of file paths to index',
								},
							},
							required: ['filePaths'],
						},
					},
					{
						name: 'retrieve_data',
						description: 'Search for code using a natural language query',
						inputSchema: {
							type: 'object',
							properties: {
								query: {
									type: 'string',
									description: 'The search query',
								},
								topK: {
									type: 'number',
									description: 'Number of results to return (default: 10)',
								},
							},
							required: ['query'],
						},
					},
					{
						name: 'reindex_all',
						description: 'Reindex the entire codebase in the specified directory',
						inputSchema: {
							type: 'object',
							properties: {
								directory: {
									type: 'string',
									description: 'The directory to reindex (default: current directory)',
								},
							},
						},
					},
					{
						name: 'start_watching',
						description: 'Start watching for file changes and automatically index them',
						inputSchema: {
							type: 'object',
							properties: {
								directory: {
									type: 'string',
									description: 'The directory to watch (default: current directory)',
								},
							},
						},
					},
					{
						name: 'stop_watching',
						description: 'Stop watching for file changes',
						inputSchema: {
							type: 'object',
							properties: {},
						},
					},
					{
						name: 'get_status',
						description: 'Get the current status of the code indexer',
						inputSchema: {
							type: 'object',
							properties: {},
						},
					},
				],
			}
		})

		// Set up tool call handler
		this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
			const { name, arguments: args } = request.params

			try {
				switch (name) {
					case 'index_specific_files':
						return await this.handleIndexSpecificFiles(args as { filePaths: string[] })

					case 'retrieve_data':
						return await this.handleRetrieveData(args as { query: string; topK?: number })

					case 'reindex_all':
						return await this.handleReindexAll(args as { directory?: string })

					case 'start_watching':
						return await this.handleStartWatching(args as { directory?: string })

					case 'stop_watching':
						return await this.handleStopWatching()

					case 'get_status':
						return await this.handleGetStatus()

					default:
						throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`)
				}
			} catch (error) {
				console.error(`Error executing tool ${name}:`, error)
				throw new McpError(
					ErrorCode.InternalError,
					error instanceof Error ? error.message : 'Unknown error'
				)
			}
		})
	}

	// Tool handlers
	private async handleIndexSpecificFiles(args: { filePaths: string[] }) {
		const { filePaths } = args

		if (!Array.isArray(filePaths)) {
			throw new McpError(ErrorCode.InvalidParams, 'filePaths must be an array')
		}

		if (filePaths.length === 0) {
			throw new McpError(ErrorCode.InvalidParams, 'filePaths array cannot be empty')
		}

		await this.indexSpecificFiles(filePaths)
		return {
			content: [{ type: 'text', text: `Successfully indexed ${filePaths.length} files` }],
		}
	}

	private async handleRetrieveData(args: { query: string; topK?: number }) {
		const { query, topK } = args

		if (!query || query.trim().length === 0) {
			throw new McpError(ErrorCode.InvalidParams, 'Query cannot be empty')
		}

		const results = await this.retrieveData(query, topK || 10)
		return {
			content: [
				{
					type: 'text',
					text: `Found ${results.length} results:\n${JSON.stringify(results, null, 2)}`,
				},
			],
		}
	}

	private async handleReindexAll(args: { directory?: string }) {
		const { directory } = args
		const targetDir = directory || './'
		await this.reindexAll(targetDir)
		return {
			content: [
				{ type: 'text', text: `Successfully reindexed all files in ${targetDir}` },
			],
		}
	}

	private async handleStartWatching(args: { directory?: string }) {
		const { directory } = args
		const targetDir = directory || './'
		await this.startWatching(targetDir)
		return {
			content: [{ type: 'text', text: `Started watching for changes in ${targetDir}` }],
		}
	}

	private async handleStopWatching() {
		await this.stopWatching()
		return {
			content: [{ type: 'text', text: 'Stopped watching for file changes' }],
		}
	}

	private async handleGetStatus() {
		const status = await this.getStatus()
		return {
			content: [
				{
					type: 'text',
					text: `Status:\n${JSON.stringify(status, null, 2)}`,
				},
			],
		}
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
	 * Starts the MCP server with stdio transport
	 * @throws Error if server fails to start
	 */
	async startServer(): Promise<void> {
		try {
			// Set up error handling
			this.mcpServer.onerror = (error) => {
				console.error('MCP Server error:', error)
			}

			// Set up process signal handlers for graceful shutdown
			const shutdown = async () => {
				console.error('Shutting down server...')
				try {
					await this.mcpServer.close()
					process.exit(0)
				} catch (error) {
					console.error('Error during shutdown:', error)
					process.exit(1)
				}
			}

			process.on('SIGINT', shutdown)
			process.on('SIGTERM', shutdown)

			// Connect the server to the stdio transport
			await this.mcpServer.connect(this.transport)

			// Log to stderr to avoid interfering with stdio communication
			console.error('Code Indexer MCP Server started successfully')
			console.error('Using stdio transport for communication')
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
