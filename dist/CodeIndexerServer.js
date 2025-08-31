import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { ListToolsRequestSchema, CallToolRequestSchema, ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';
import { QdrantClient } from '@qdrant/js-client-rest';
import { CodeIndexer } from './CodeIndexer.js';
import { FileWatcher } from './FileWatcher.js';
import { ConfigManager } from './config.js';
import { getLogger } from './logger.js';
export class CodeIndexerServer {
    constructor(config) {
        this.configManager = ConfigManager.getInstance();
        this.config = config || this.configManager.loadConfig();
        this.collectionName = this.config.collectionName;
        this.logger = getLogger('CodeIndexerServer');
        this.logger.configure({
            level: this.config.logging.level,
            console: this.config.logging.console,
            file: this.config.logging.file,
        });
        try {
            this.logger.info('Initializing Qdrant client', { url: this.config.qdrant.url });
            const qdrantConfig = {
                url: this.config.qdrant.url,
            };
            if (this.config.qdrant.apiKey) {
                qdrantConfig.apiKey = this.config.qdrant.apiKey;
            }
            this.qdrantClient = new QdrantClient(qdrantConfig);
            this.logger.info('Qdrant client initialized successfully');
        }
        catch (error) {
            this.logger.error('Failed to initialize Qdrant client', {
                error: error instanceof Error ? error.message : 'Unknown error',
                url: this.config.qdrant.url,
                hasApiKey: !!this.config.qdrant.apiKey,
            });
            throw new Error(`Qdrant client initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        try {
            this.indexer = new CodeIndexer(this.qdrantClient, this.collectionName, this.config);
            this.logger.info('CodeIndexer initialized successfully');
        }
        catch (error) {
            this.logger.error('Failed to initialize Enhanced CodeIndexer', {
                error: error instanceof Error ? error.message : 'Unknown error',
            });
            throw new Error(`Enhanced CodeIndexer initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
        this.watcher = new FileWatcher(this.indexer, this.config.watching);
        this.mcpServer = new Server({
            name: 'code-indexer',
            version: '1.0.1',
        }, {
            capabilities: {
                tools: {
                    supported: true,
                    available: [
                        'index_specific_files',
                        'retrieve_data',
                        'reindex_all',
                        'start_watching',
                        'stop_watching',
                        'get_status'
                    ]
                },
            },
        });
        this.transport = new StdioServerTransport();
        this.setupTools();
    }
    setupTools() {
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
                                    description: 'Array of file paths to index'
                                }
                            },
                            required: ['filePaths']
                        }
                    },
                    {
                        name: 'retrieve_data',
                        description: 'Search for code using a natural language query',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                query: {
                                    type: 'string',
                                    description: 'The search query'
                                },
                                topK: {
                                    type: 'number',
                                    description: 'Number of results to return (default: 10)'
                                }
                            },
                            required: ['query']
                        }
                    },
                    {
                        name: 'reindex_all',
                        description: 'Reindex the entire codebase in the specified directory',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                directory: {
                                    type: 'string',
                                    description: 'The directory to reindex (default: current directory)'
                                }
                            }
                        }
                    },
                    {
                        name: 'start_watching',
                        description: 'Start watching for file changes and automatically index them',
                        inputSchema: {
                            type: 'object',
                            properties: {
                                directory: {
                                    type: 'string',
                                    description: 'The directory to watch (default: current directory)'
                                }
                            }
                        }
                    },
                    {
                        name: 'stop_watching',
                        description: 'Stop watching for file changes',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    },
                    {
                        name: 'get_status',
                        description: 'Get the current status of the code indexer',
                        inputSchema: {
                            type: 'object',
                            properties: {}
                        }
                    }
                ]
            };
        });
        this.mcpServer.setRequestHandler(CallToolRequestSchema, async (request) => {
            const { name, arguments: args } = request.params;
            try {
                switch (name) {
                    case 'index_specific_files':
                        return await this.handleIndexSpecificFiles(args);
                    case 'retrieve_data':
                        return await this.handleRetrieveData(args);
                    case 'reindex_all':
                        return await this.handleReindexAll(args);
                    case 'start_watching':
                        return await this.handleStartWatching(args);
                    case 'stop_watching':
                        return await this.handleStopWatching();
                    case 'get_status':
                        return await this.handleGetStatus();
                    default:
                        throw new McpError(ErrorCode.MethodNotFound, `Tool not found: ${name}`);
                }
            }
            catch (error) {
                console.error(`Error executing tool ${name}:`, error);
                throw new McpError(ErrorCode.InternalError, error instanceof Error ? error.message : 'Unknown error');
            }
        });
    }
    async handleIndexSpecificFiles(args) {
        const { filePaths } = args;
        if (!Array.isArray(filePaths)) {
            throw new McpError(ErrorCode.InvalidParams, 'filePaths must be an array');
        }
        if (filePaths.length === 0) {
            throw new McpError(ErrorCode.InvalidParams, 'filePaths array cannot be empty');
        }
        await this.indexSpecificFiles(filePaths);
        return {
            content: [
                { type: 'text', text: `Successfully indexed ${filePaths.length} files` },
            ],
        };
    }
    async handleRetrieveData(args) {
        const { query, topK } = args;
        if (!query || query.trim().length === 0) {
            throw new McpError(ErrorCode.InvalidParams, 'Query cannot be empty');
        }
        const results = await this.retrieveData(query, topK || 10);
        return {
            content: [
                {
                    type: 'text',
                    text: `Found ${results.length} results:\n${JSON.stringify(results, null, 2)}`,
                },
            ],
        };
    }
    async handleReindexAll(args) {
        const { directory } = args;
        const targetDir = directory || './';
        await this.reindexAll(targetDir);
        return {
            content: [
                { type: 'text', text: `Successfully reindexed all files in ${targetDir}` },
            ],
        };
    }
    async handleStartWatching(args) {
        const { directory } = args;
        const targetDir = directory || './';
        await this.startWatching(targetDir);
        return {
            content: [
                { type: 'text', text: `Started watching for changes in ${targetDir}` },
            ],
        };
    }
    async handleStopWatching() {
        await this.stopWatching();
        return {
            content: [
                { type: 'text', text: 'Stopped watching for file changes' },
            ],
        };
    }
    async handleGetStatus() {
        const status = await this.getStatus();
        return {
            content: [
                {
                    type: 'text',
                    text: `Status:\n${JSON.stringify(status, null, 2)}`,
                },
            ],
        };
    }
    async initialize() {
        try {
            console.log('Initializing CodeIndexer server...');
            try {
                console.log('Testing Qdrant connection...');
                await this.qdrantClient.getCollections();
                console.log('✓ Qdrant connection successful');
            }
            catch (error) {
                console.error('✗ Qdrant connection failed:', error);
                if (error?.status === 401) {
                    throw new Error('Qdrant authentication failed. Please check your API key.');
                }
                else if (error?.code === 'ECONNREFUSED') {
                    throw new Error('Cannot connect to Qdrant server. Please check if Qdrant is running and the URL is correct.');
                }
                else {
                    throw new Error(`Qdrant connection error: ${error.message || 'Unknown error'}`);
                }
            }
            try {
                console.log(`Checking if collection '${this.collectionName}' exists...`);
                await this.qdrantClient.getCollection(this.collectionName);
                console.log(`✓ Collection '${this.collectionName}' already exists`);
            }
            catch (error) {
                if (error?.status === 404) {
                    console.log(`Creating collection '${this.collectionName}'...`);
                    await this.qdrantClient.createCollection(this.collectionName, {
                        vectors: {
                            size: this.config.embedding.dimensions,
                            distance: 'Cosine',
                        },
                    });
                    console.log(`✓ Collection '${this.collectionName}' created successfully`);
                }
                else {
                    throw error;
                }
            }
            console.log('✓ CodeIndexer server initialized successfully');
        }
        catch (error) {
            console.error('✗ Error initializing server:', error);
            throw new Error(`Failed to initialize server: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async indexSpecificFiles(filePaths) {
        try {
            if (!Array.isArray(filePaths)) {
                throw new Error('filePaths must be an array');
            }
            await this.indexer.indexFiles(filePaths);
        }
        catch (error) {
            console.error('Error indexing specific files:', error);
            throw new Error(`Failed to index specific files: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async retrieveData(query, topK = 10) {
        try {
            return await this.indexer.search(query, topK);
        }
        catch (error) {
            console.error('Error retrieving data:', error);
            throw new Error(`Failed to retrieve data: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async reindexAll(directory = './') {
        try {
            await this.indexer.reindexAll(directory);
        }
        catch (error) {
            console.error('Error reindexing all files:', error);
            throw new Error(`Failed to reindex all files: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async getStatus() {
        try {
            let qdrantConnected = false;
            try {
                await this.qdrantClient.getCollections();
                qdrantConnected = true;
            }
            catch (error) {
                console.warn('Qdrant connection test failed:', error);
                qdrantConnected = false;
            }
            return {
                watching: this.watcher.isWatching(),
                collectionName: this.collectionName,
                qdrantUrl: this.config.qdrant.url,
                embeddingModel: this.config.embedding.model,
                qdrantConnected,
                ollamaHost: this.config.ollama.host,
            };
        }
        catch (error) {
            console.error('Error getting status:', error);
            throw new Error(`Failed to get status: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    startWatching(directory) {
        try {
            this.watcher.startWatching(directory);
        }
        catch (error) {
            console.error('Error starting watch:', error);
            throw new Error(`Failed to start watch: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    stopWatching() {
        try {
            this.watcher.stopWatching();
        }
        catch (error) {
            console.error('Error stopping watch:', error);
            throw new Error(`Failed to stop watch: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async startServer() {
        try {
            this.mcpServer.onerror = (error) => {
                console.error('MCP Server error:', error);
            };
            const shutdown = async () => {
                console.error('Shutting down server...');
                try {
                    await this.mcpServer.close();
                    process.exit(0);
                }
                catch (error) {
                    console.error('Error during shutdown:', error);
                    process.exit(1);
                }
            };
            process.on('SIGINT', shutdown);
            process.on('SIGTERM', shutdown);
            await this.mcpServer.connect(this.transport);
            console.error('Code Indexer MCP Server started successfully');
            console.error('Using stdio transport for communication');
        }
        catch (error) {
            console.error('Error starting server:', error);
            throw new Error(`Failed to start server: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async stopServer() {
        try {
            await this.mcpServer.close();
            console.log('Server closed');
        }
        catch (error) {
            console.error('Error closing server:', error);
        }
    }
}
//# sourceMappingURL=CodeIndexerServer.js.map