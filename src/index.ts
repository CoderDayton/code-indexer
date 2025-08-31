#!/usr/bin/env node
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import * as dotenv from 'dotenv'

// Load environment variables (for local development)
const here = dirname(fileURLToPath(import.meta.url))
try {
	dotenv.config({ path: join(here, '..', '.env') })
} catch (error) {
	// .env file might not exist when running via npx, which is fine
	// Environment variables should come from MCP client configuration
}

import { CodeIndexerServer } from './CodeIndexerServer.js'
import { loadConfig } from './config.js'

/**
 * Wait for configuration to stabilize and validate required environment variables
 * @param maxWaitMs Maximum time to wait in milliseconds
 * @returns Promise that resolves when config is ready or rejects if timeout
 */
async function waitForConfigReady(maxWaitMs: number = 3000): Promise<void> {
	const startTime = Date.now()
	const checkInterval = 100 // Check every 100ms

	return new Promise((resolve, reject) => {
		const checkConfig = () => {
			const elapsed = Date.now() - startTime

			if (elapsed >= maxWaitMs) {
				reject(
					new Error(
						`Configuration timeout: Required environment variables not loaded after ${maxWaitMs}ms. Please ensure QDRANT_API_KEY is available via .env file or MCP client configuration.`
					)
				)
				return
			}

			try {
				const config = loadConfig()

				// Check if we have the required API key
				if (config.qdrant.apiKey && config.qdrant.apiKey.trim().length > 0) {
					console.error(`✓ Configuration loaded successfully after ${elapsed}ms`)
					resolve()
					return
				}

				// If no API key yet, wait and try again
				setTimeout(checkConfig, checkInterval)
			} catch (error) {
				// Configuration loading failed, wait and try again
				setTimeout(checkConfig, checkInterval)
			}
		}

		// Start checking immediately
		checkConfig()
	})
}

/**
 * Main entry point for the Code Indexer MCP Server with stdio transport
 *
 * This function initializes and starts the server with stdin/stdout communication
 *
 * @author malu
 */
async function main() {
	try {
		console.error('Starting Code Indexer MCP Server...')

		// Wait for configuration to be ready (give environment variables time to load)
		console.error('⏳ Waiting for configuration to load...')
		await waitForConfigReady(3000)

		const config = loadConfig()
		const server = new CodeIndexerServer(config)
		await server.initialize()

		console.error('✓ Code Indexer MCP Server initialized successfully')

		// Start MCP server with stdio transport
		await server.startServer()
	} catch (error) {
		console.error('✗ Error initializing server:', error)
		console.error('\nTroubleshooting tips:')
		console.error('- Ensure QDRANT_API_KEY is set in your environment or .env file')
		console.error(
			'- Check that your MCP client configuration includes the required env variables'
		)
		console.error('- Verify that Qdrant is running and accessible at the configured URL')
		process.exit(1)
	}
}

main().catch(console.error)
