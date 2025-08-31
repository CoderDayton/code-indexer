#!/usr/bin/env node
import { CodeIndexerServer } from './CodeIndexerServer.js'
import { loadConfig } from './config.js'

/**
 * Main entry point for the Code Indexer MCP Server with stdio transport
 *
 * This function initializes and starts the server with stdin/stdout communication
 *
 * @author malu
 */
async function main() {
	try {
		// Load configuration
		const config = loadConfig()

		// Create server instance
		const server = new CodeIndexerServer(config)

		// Initialize the server (no auto-indexing)
		await server.initialize()

		// Log to stderr to avoid interfering with stdio communication
		console.error('Code Indexer MCP Server initialized')

		// Start MCP server with stdio transport
		await server.startServer()

		// The server will run until the process is terminated
		// No need for additional shutdown handling since stdio handles process termination
	} catch (error) {
		console.error('Error initializing server:', error)
		process.exit(1)
	}
}

main().catch(console.error)
