import { config as dotenvConfig } from 'dotenv'
import { expand } from 'dotenv-expand'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

/**
 * Environment file loader with support for multiple environment files
 * and variable expansion
 */
export class EnvironmentLoader {
	private static instance: EnvironmentLoader | null = null
	private loadedFiles: string[] = []
	private isLoaded = false

	private constructor() {}

	/**
	 * Get singleton instance
	 */
	static getInstance(): EnvironmentLoader {
		if (!EnvironmentLoader.instance) {
			EnvironmentLoader.instance = new EnvironmentLoader()
		}
		return EnvironmentLoader.instance
	}

	/**
	 * Load environment variables from multiple sources with priority
	 * Priority order (highest to lowest):
	 * 1. Process environment variables
	 * 2. .env.local
	 * 3. .env.[NODE_ENV]
	 * 4. .env
	 * 5. ~/.config/code-indexer/.env
	 */
	loadEnvironment(options: LoadEnvironmentOptions = {}): LoadResult {
		if (this.isLoaded && !options.reload) {
			return {
				success: true,
				loadedFiles: this.loadedFiles,
				message: 'Environment already loaded',
			}
		}

		const {
			baseDirectory = process.cwd(),
			nodeEnv = process.env.NODE_ENV || 'development',
			userConfigDir = path.join(os.homedir(), '.config', 'code-indexer'),
			override = false,
		} = options

		const results: EnvLoadResult[] = []
		this.loadedFiles = []

		try {
			// 1. Load base .env file
			const baseEnvPath = path.join(baseDirectory, '.env')
			results.push(this.loadSingleFile(baseEnvPath, { override }))

			// 2. Load environment-specific file (.env.development, .env.production, etc.)
			const envSpecificPath = path.join(baseDirectory, `.env.${nodeEnv}`)
			results.push(this.loadSingleFile(envSpecificPath, { override }))

			// 3. Load local overrides (.env.local)
			const localEnvPath = path.join(baseDirectory, '.env.local')
			results.push(this.loadSingleFile(localEnvPath, { override }))

			// 4. Load user config directory
			const userEnvPath = path.join(userConfigDir, '.env')
			results.push(this.loadSingleFile(userEnvPath, { override }))

			// 5. Apply variable expansion to all loaded variables
			this.expandVariables()

			this.isLoaded = true

			const loadedCount = results.filter((r) => r.loaded).length
			const totalFiles = results.length

			return {
				success: true,
				loadedFiles: this.loadedFiles,
				message: `Successfully loaded ${loadedCount}/${totalFiles} environment files`,
				details: results,
			}
		} catch (error) {
			return {
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				loadedFiles: this.loadedFiles,
				details: results,
			}
		}
	}

	/**
	 * Load a single environment file
	 */
	private loadSingleFile(
		filePath: string,
		options: { override?: boolean } = {}
	): EnvLoadResult {
		try {
			if (!fs.existsSync(filePath)) {
				return {
					path: filePath,
					loaded: false,
					reason: 'File does not exist',
				}
			}

			const stats = fs.statSync(filePath)
			if (!stats.isFile()) {
				return {
					path: filePath,
					loaded: false,
					reason: 'Path is not a file',
				}
			}

			const result = dotenvConfig({
				path: filePath,
				override: options.override,
			})

			if (result.error) {
				return {
					path: filePath,
					loaded: false,
					reason: result.error.message,
					error: result.error,
				}
			}

			this.loadedFiles.push(filePath)
			return {
				path: filePath,
				loaded: true,
				variables: Object.keys(result.parsed || {}),
			}
		} catch (error) {
			return {
				path: filePath,
				loaded: false,
				reason: error instanceof Error ? error.message : 'Unknown error',
				error: error instanceof Error ? error : new Error('Unknown error'),
			}
		}
	}

	/**
	 * Apply variable expansion to environment variables
	 */
	private expandVariables(): void {
		// Filter out undefined values to match DotenvPopulateInput type
		const filteredEnv: Record<string, string> = {}
		for (const [key, value] of Object.entries(process.env)) {
			if (value !== undefined) {
				filteredEnv[key] = value
			}
		}
		expand({ processEnv: filteredEnv })
	}

	/**
	 * Force reload environment variables
	 */
	reload(options: LoadEnvironmentOptions = {}): LoadResult {
		this.isLoaded = false
		this.loadedFiles = []
		return this.loadEnvironment({ ...options, reload: true })
	}

	/**
	 * Get list of loaded files
	 */
	getLoadedFiles(): string[] {
		return [...this.loadedFiles]
	}

	/**
	 * Check if environment is loaded
	 */
	isEnvironmentLoaded(): boolean {
		return this.isLoaded
	}
}

/**
 * Configuration options for environment loading
 */
export interface LoadEnvironmentOptions {
	baseDirectory?: string
	nodeEnv?: string
	userConfigDir?: string
	override?: boolean
	reload?: boolean
}

/**
 * Result of loading environment files
 */
export interface LoadResult {
	success: boolean
	loadedFiles: string[]
	message?: string
	error?: string
	details?: EnvLoadResult[]
}

/**
 * Result of loading a single environment file
 */
export interface EnvLoadResult {
	path: string
	loaded: boolean
	reason?: string
	variables?: string[]
	error?: Error
}

/**
 * Quick load function for simple use cases
 */
export function loadEnvironment(options?: LoadEnvironmentOptions): LoadResult {
	return EnvironmentLoader.getInstance().loadEnvironment(options)
}

/**
 * Force reload environment
 */
export function reloadEnvironment(options?: LoadEnvironmentOptions): LoadResult {
	return EnvironmentLoader.getInstance().reload(options)
}
