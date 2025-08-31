import { CodeIndexerServer } from './CodeIndexerServer.js'
import { loadConfig } from './config.js'

/**
 * Main entry point for the Code Indexer MCP Server
 *
 * This function initializes and starts the server, handling graceful shutdown
 *
 * @author malu
 */
async function main() {
	let server: CodeIndexerServer | null = null

	try {
		// Load configuration
		const config = loadConfig()

		// Create server instance
		server = new CodeIndexerServer(config)

		// Initialize the server (no auto-indexing)
		await server.initialize()
		console.log('Code Indexer MCP Server initialized')

		// Start MCP server
		await server.startServer()

		console.log('Code Indexer MCP Server is running. Press Ctrl+C to stop.')
	} catch (error) {
		console.error('Error initializing server:', error)
		process.exit(1)
	}

	// Handle graceful shutdown
	const gracefulShutdown = async () => {
		console.log('Shutting down gracefully...')
		if (server) {
			server.stopWatching()
			await server.stopServer()
		}
		process.exit(0)
	}

	process.on('SIGINT', () => {
		gracefulShutdown().catch(console.error)
	})
	process.on('SIGTERM', () => {
		gracefulShutdown().catch(console.error)
	})
}

main().catch(console.error)
