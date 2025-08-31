import * as chokidar from 'chokidar'
import { ICodeIndexer } from './ICodeIndexer.js'

interface WatchingConfig {
	ignorePatterns: string[]
}

/**
 * FileWatcher monitors file system changes and updates the code index accordingly
 *
 * This class is responsible for:
 * 1. Watching file system for changes (add, update, delete)
 * 2. Triggering reindexing when files change
 * 3. Managing the file watching lifecycle
 *
 * @author malu
 */
export class FileWatcher {
	private indexer: ICodeIndexer
	private config: WatchingConfig
	private watcher: chokidar.FSWatcher | null

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

			this.watcher = chokidar.watch(directory, {
				ignored: this.config.ignorePatterns,
				persistent: true,
			})

			this.watcher
				.on('add', async (filePath: string) => {
					console.log(`File ${filePath} has been added`)
					try {
						await this.indexer.indexFile(filePath)
					} catch (error) {
						console.error(`Failed to index added file ${filePath}:`, error)
					}
				})
				.on('change', async (filePath: string) => {
					console.log(`File ${filePath} has been changed`)
					try {
						await this.indexer.indexFile(filePath)
					} catch (error) {
						console.error(`Failed to reindex changed file ${filePath}:`, error)
					}
				})
				.on('unlink', async (filePath: string) => {
					console.log(`File ${filePath} has been removed`)
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
}
