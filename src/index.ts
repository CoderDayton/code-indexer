#!/usr/bin/env node
import { initializeConfiguration, getConfigManager } from './config/unified.js'
import { CodeIndexerServer } from './CodeIndexerServer.js'
import { onStartup } from './startup.js'


async function main() {
	try {
		console.log('🔧 Initializing configuration system...')

		// Initialize the new unified configuration system
		const initResult = await initializeConfiguration()

		if (!initResult.success) {
			console.error('❌ Configuration initialization failed')

			if (initResult.troubleshooting && initResult.troubleshooting.length > 0) {
				console.error('\n🔍 Troubleshooting Guide:')
				initResult.troubleshooting.forEach((line: string) => console.error(line))
			}

			if (initResult.validationErrors && initResult.validationErrors.length > 0) {
				console.error('\n📋 Validation Errors:')
				initResult.validationErrors.forEach((error: { field: string; message: string }, index: number) => {
					console.error(`${index + 1}. ${error.field}: ${error.message}`)
				})
			}

			process.exit(1)
		}

		console.log('✅ Configuration initialized successfully')
		console.log(`📁 Loaded environment files: ${initResult.environment.loadedFiles?.join(', ') || 'none'}`)

		// Get the validated configuration
		const configManager = getConfigManager()
		const config = configManager.getConfig()

		console.log('🚀 Starting Code Indexer MCP Server...')
		const server = new CodeIndexerServer(config)
		await server.startServer()

		// Non-blocking startup tasks (after server is ready)
		onStartup(server, config).catch((e) => {
			console.error('Startup hook failed:', e)
		})

	} catch (err: any) {
		console.error('💥 Fatal error initializing server:', err)
		console.error('\n🔍 Common Solutions:')
		console.error('- Check your .env file exists and has correct format')
		console.error('- Verify QDRANT_URL and QDRANT_API_KEY are properly set')
		console.error('- Ensure URLs include protocol (https://) and port if needed')
		console.error('- Run `npm run validate-env` to check configuration')
		process.exit(1)
	}
}

main().catch((err: any) => {
	console.error('💥 Unhandled error:', err)
	process.exit(1)
})