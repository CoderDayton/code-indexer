import * as chokidar from 'chokidar'
import { ICodeIndexer } from './ICodeIndexer.js'

interface WatchingConfig {
	ignorePatterns: string[]
	exclusionConfigPath: string
	useAdvancedExclusions: boolean
	debounceMs: number
	enableWatching: boolean
}

/**
 * FileWatcher monitors file system changes and updates the code index accordingly
 *
 * This class is responsible for:
 * 1. Watching file system for changes (add, update, delete)
 * 2. Triggering reindexing when files change
 * 3. Managing the file watching lifecycle
 * 4. Respecting exclusion patterns (both legacy and advanced)
 *
 * @author malu
 */
export class FileWatcher {
	private indexer: ICodeIndexer
	private config: WatchingConfig
	private watcher: chokidar.FSWatcher | null
	private debounceTimers: Map<string, NodeJS.Timeout> = new Map()

	constructor(indexer: ICodeIndexer, config: WatchingConfig) {
		this.indexer = indexer
		this.config = config
		this.watcher = null
	}

	/**
	 * Starts watching a directory for file changes
	 * @param directory The directory to watch
	 */
	startWatching(directory: string): void {
		try {
			// Close existing watcher if any
			if (this.watcher) {
				this.stopWatching()
			}

			// Use legacy ignore patterns for chokidar (basic filtering)
			// The advanced exclusion system will do additional filtering in the indexer
			const chokidarIgnorePatterns = this.config.useAdvancedExclusions
				? this.getBasicIgnorePatterns()
				: this.config.ignorePatterns

			this.watcher = chokidar.watch(directory, {
				ignored: chokidarIgnorePatterns,
				persistent: true,
				ignoreInitial: true, // Don't trigger events for existing files
			})

			this.watcher
				.on('add', (filePath: string) => {
					console.log(`File ${filePath} has been added`)
					this.debouncedIndexFile(filePath)
				})
				.on('change', (filePath: string) => {
					console.log(`File ${filePath} has been changed`)
					this.debouncedIndexFile(filePath)
				})
				.on('unlink', async (filePath: string) => {
					console.log(`File ${filePath} has been removed`)
					// Clear any pending debounced operations for this file
					this.clearDebounceTimer(filePath)
					try {
						await this.indexer.deleteFileFromIndex(filePath)
					} catch (error) {
						console.error(`Failed to remove deleted file ${filePath} from index:`, error)
					}
				})
				.on('error', (error: Error) => {
					console.error(`File watcher error:`, error)
				})

			console.log(`Started watching directory: ${directory}`)
			console.log(`Using ${this.config.useAdvancedExclusions ? 'advanced' : 'legacy'} exclusion system`)
		} catch (error) {
			console.error(`Failed to start watching directory ${directory}:`, error)
			throw new Error(
				`Failed to start watching: ${
					error instanceof Error ? error.message : 'Unknown error'
				}`
			)
		}
	}

	/**
	 * Stops watching for file changes
	 */
	stopWatching(): void {
		if (this.watcher) {
			// Clear all pending debounce timers
			this.debounceTimers.forEach((timer) => clearTimeout(timer))
			this.debounceTimers.clear()

			this.watcher
				.close()
				.then(() => {
					console.log('File watcher closed successfully')
				})
				.catch((error) => {
					console.error('Error closing file watcher:', error)
				})
			this.watcher = null
			console.log('Stopped watching')
		}
	}

	/**
	 * Checks if the watcher is currently active
	 * @returns true if watching, false otherwise
	 */
	isWatching(): boolean {
		return !!this.watcher
	}

	/**
	 * Debounced file indexing to prevent excessive indexing on rapid file changes
	 * @param filePath The file path to index
	 */
	private debouncedIndexFile(filePath: string): void {
		// Clear existing timer for this file
		this.clearDebounceTimer(filePath)

		// Set new timer
		const timer = setTimeout(async () => {
			try {
				await this.indexer.indexFile(filePath)
				this.debounceTimers.delete(filePath)
			} catch (error) {
				console.error(`Failed to index file ${filePath}:`, error)
				this.debounceTimers.delete(filePath)
			}
		}, this.config.debounceMs)

		this.debounceTimers.set(filePath, timer)
	}

	/**
	 * Clear debounce timer for a specific file
	 * @param filePath The file path
	 */
	private clearDebounceTimer(filePath: string): void {
		const existingTimer = this.debounceTimers.get(filePath)
		if (existingTimer) {
			clearTimeout(existingTimer)
			this.debounceTimers.delete(filePath)
		}
	}

	/**
	 * Get basic ignore patterns for chokidar when using advanced exclusions
	 * This provides a first-level filter before the advanced exclusion system
	 * @returns Array of basic ignore patterns
	 */
	private getBasicIgnorePatterns(): string[] {
		return [
			'**/node_modules/**',
			'**/.git/**',
			'**/dist/**',
			'**/build/**',
			'**/coverage/**',
			'**/.next/**',
			'**/.nuxt/**',
			'**/target/**',
			'**/bin/**',
			'**/obj/**',
			'**/__pycache__/**',
			'**/.venv/**',
			'**/venv/**',
			'**/*.log',
			'**/*.tmp',
			'**/*.cache',
			'**/.DS_Store',
			'**/Thumbs.db'
		]
	}
}
