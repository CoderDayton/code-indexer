/**
 * Exclusion Configuration Module
 * Handles loading and parsing of indexer exclusion configuration
 */

import * as fs from 'fs'
import * as path from 'path'
import { z } from 'zod'
import { getLogger } from '../logger.js'

const logger = getLogger('ExclusionConfig')

/**
 * Schema for size limits configuration
 */
const SizeLimitsSchema = z.object({
	max_file_size_mb: z.number().positive().optional().default(50),
	max_file_size_bytes: z.number().positive().optional().default(52428800),
})

/**
 * Schema for content-based exclusion rules
 */
const ContentBasedSchema = z.object({
	binary_files: z.boolean().optional().default(true),
	empty_files: z.boolean().optional().default(false),
	minified_files: z.boolean().optional().default(true),
})

/**
 * Schema for language-specific exclusions
 */
const LanguageSpecificSchema = z.object({
	folders: z.array(z.string()).optional().default([]),
	files: z.array(z.string()).optional().default([]),
})

/**
 * Schema for custom rules
 */
const CustomRulesSchema = z.object({
	exclude_test_files: z.boolean().optional().default(false),
	exclude_documentation: z.boolean().optional().default(false),
	exclude_config_files: z.boolean().optional().default(false),
	exclude_sample_data: z.boolean().optional().default(true),
})

/**
 * Main exclusion configuration schema
 */
const ExclusionConfigSchema = z.object({
	$schema: z.string().optional(),
	title: z.string().optional(),
	description: z.string().optional(),
	version: z.string().optional(),
	exclusions: z.object({
		folders: z.object({
			description: z.string().optional(),
			patterns: z.array(z.string()).default([]),
		}),
		files: z.object({
			description: z.string().optional(),
			patterns: z.array(z.string()).default([]),
		}),
		extensions: z.object({
			description: z.string().optional(),
			patterns: z.array(z.string()).default([]),
		}),
		exact_names: z.object({
			description: z.string().optional(),
			patterns: z.array(z.string()).default([]),
		}),
		size_limits: SizeLimitsSchema.optional(),
		content_based: ContentBasedSchema.optional(),
	}),
	inclusion_overrides: z.object({
		description: z.string().optional(),
		patterns: z.array(z.string()).default([]),
	}).optional(),
	language_specific: z.record(z.string(), LanguageSpecificSchema).optional(),
	custom_rules: CustomRulesSchema.optional(),
})

/**
 * Type definitions
 */
export type ExclusionConfig = z.infer<typeof ExclusionConfigSchema>
export type SizeLimits = z.infer<typeof SizeLimitsSchema>
export type ContentBasedRules = z.infer<typeof ContentBasedSchema>
export type LanguageSpecific = z.infer<typeof LanguageSpecificSchema>
export type CustomRules = z.infer<typeof CustomRulesSchema>

/**
 * Default exclusion configuration
 */
const DEFAULT_EXCLUSION_CONFIG: ExclusionConfig = {
	exclusions: {
		folders: {
			patterns: [
				'node_modules/**',
				'.git/**',
				'dist/**',
				'build/**',
				'coverage/**',
				'__pycache__/**',
				'.venv/**',
				'venv/**',
				'target/**',
				'bin/**',
				'obj/**',
				'tmp/**',
				'temp/**',
				'logs/**',
			],
		},
		files: {
			patterns: [
				'*.log',
				'*.tmp',
				'*.temp',
				'*.cache',
				'*.pid',
				'*.lock',
				'*.swp',
				'*.swo',
				'*~',
				'.DS_Store',
				'Thumbs.db',
				'*.min.js',
				'*.min.css',
				'*.map',
				'package-lock.json',
				'yarn.lock',
				'*.pyc',
				'*.class',
				'*.jar',
				'*.dll',
				'*.exe',
				'*.so',
				'*.o',
				'*.obj',
			],
		},
		extensions: {
			patterns: ['log', 'tmp', 'temp', 'cache', 'bak', 'backup', 'old', 'swp', 'swo', 'pid', 'lock'],
		},
		exact_names: {
			patterns: [
				'.DS_Store',
				'Thumbs.db',
				'desktop.ini',
				'.gitkeep',
				'.eslintcache',
				'.stylelintcache',
				'npm-debug.log',
				'yarn-debug.log',
				'yarn-error.log',
			],
		},
		size_limits: {
			max_file_size_mb: 50,
			max_file_size_bytes: 52428800,
		},
		content_based: {
			binary_files: true,
			empty_files: false,
			minified_files: true,
		},
	},
	inclusion_overrides: {
		patterns: [
			'README.*',
			'LICENSE*',
			'CHANGELOG.*',
			'CONTRIBUTING.*',
			'*.md',
			'*.txt',
			'Dockerfile*',
			'Makefile',
		],
	},
	custom_rules: {
		exclude_test_files: false,
		exclude_documentation: false,
		exclude_config_files: false,
		exclude_sample_data: true,
	},
}

/**
 * Exclusion configuration manager
 */
export class ExclusionConfigManager {
	private config: ExclusionConfig
	private configPath: string | null = null

	constructor(config?: ExclusionConfig) {
		this.config = config || DEFAULT_EXCLUSION_CONFIG
	}

	/**
	 * Load exclusion configuration from file
	 */
	static async loadFromFile(filePath: string): Promise<ExclusionConfigManager> {
		try {
			logger.info('Loading exclusion configuration', { filePath })

			// Check if file exists
			if (!fs.existsSync(filePath)) {
				logger.warn('Exclusion config file not found, using defaults', {
					filePath,
					fallbackReason: 'File does not exist'
				})
				return new ExclusionConfigManager()
			}

			// Check file permissions
			try {
				await fs.promises.access(filePath, fs.constants.R_OK)
			} catch (accessError) {
				logger.error('Cannot read exclusion config file', {
					filePath,
					error: accessError instanceof Error ? accessError.message : 'Permission denied'
				})
				return new ExclusionConfigManager()
			}

			// Read and parse file
			let fileContent: string
			try {
				fileContent = await fs.promises.readFile(filePath, 'utf-8')
			} catch (readError) {
				logger.error('Failed to read exclusion config file', {
					filePath,
					error: readError instanceof Error ? readError.message : 'Read error'
				})
				return new ExclusionConfigManager()
			}

			// Parse JSON
			let rawConfig: any
			try {
				rawConfig = JSON.parse(fileContent)
			} catch (parseError) {
				logger.error('Invalid JSON in exclusion config file', {
					filePath,
					error: parseError instanceof Error ? parseError.message : 'JSON parse error',
					hint: 'Check for syntax errors in the configuration file'
				})
				return new ExclusionConfigManager()
			}

			// Lenient cleanup of common doc fields before validation
			try {
				if (rawConfig && typeof rawConfig === 'object') {
					// Drop language_specific.description if present (docs string often included)
					if (
						rawConfig.language_specific &&
						typeof rawConfig.language_specific.description === 'string'
					) {
						logger.info('Removing non-schema field language_specific.description from exclusion config')
						delete rawConfig.language_specific.description
					}

					// Filter out any non-object entries under language_specific
					if (rawConfig.language_specific && typeof rawConfig.language_specific === 'object') {
						for (const [key, value] of Object.entries(rawConfig.language_specific)) {
							if (typeof value !== 'object' || value === null) {
								logger.warn('Removing invalid language_specific entry (expected object with folders/files arrays)', { key })
								delete (rawConfig.language_specific as any)[key]
							}
						}
					}
				}
			} catch (cleanupError) {
				logger.warn('Exclusion config cleanup encountered an issue', {
					error: cleanupError instanceof Error ? cleanupError.message : 'Unknown error',
				})
			}

			// Validate configuration against schema
			let validatedConfig: ExclusionConfig
			try {
				validatedConfig = ExclusionConfigSchema.parse(rawConfig)
			} catch (validationError) {
				logger.error('Invalid exclusion configuration schema', {
					filePath,
					error: validationError instanceof Error ? validationError.message : 'Validation error',
					hint: 'Check the configuration file format against the schema'
				})
				return new ExclusionConfigManager()
			}

			// Validate patterns
			const validationResult = ExclusionConfigManager.validatePatterns(validatedConfig)
			if (!validationResult.isValid) {
				logger.warn('Some exclusion patterns are invalid', {
					filePath,
					invalidPatterns: validationResult.invalidPatterns,
					hint: 'Invalid patterns will be ignored'
				})
			}

			logger.info('Successfully loaded exclusion configuration', {
				filePath,
				folderPatterns: validatedConfig.exclusions.folders.patterns.length,
				filePatterns: validatedConfig.exclusions.files.patterns.length,
				extensionPatterns: validatedConfig.exclusions.extensions.patterns.length,
				exactNamePatterns: validatedConfig.exclusions.exact_names.patterns.length,
				validPatterns: validationResult.validPatterns,
				invalidPatterns: validationResult.invalidPatterns
			})

			const manager = new ExclusionConfigManager(validatedConfig)
			manager.configPath = filePath
			return manager
		} catch (error) {
			logger.error('Unexpected error loading exclusion configuration', {
				filePath,
				error: error instanceof Error ? error.message : 'Unknown error',
				stack: error instanceof Error ? error.stack : undefined
			})

			// Return default configuration on any unexpected error
			logger.info('Falling back to default exclusion configuration')
			return new ExclusionConfigManager()
		}
	}

	/**
	 * Get the current configuration
	 */
	getConfig(): ExclusionConfig {
		return this.config
	}

	/**
	 * Get all exclusion patterns as a flat array (for backward compatibility)
	 */
	getAllExclusionPatterns(): string[] {
		const patterns: string[] = []

		// Add folder patterns
		patterns.push(...this.config.exclusions.folders.patterns)

		// Add file patterns
		patterns.push(...this.config.exclusions.files.patterns)

		// Add extension patterns (convert to glob patterns)
		patterns.push(...this.config.exclusions.extensions.patterns.map(ext => `*.${ext}`))

		// Add exact name patterns
		patterns.push(...this.config.exclusions.exact_names.patterns)

		// Add language-specific patterns if available
		if (this.config.language_specific) {
			for (const langConfig of Object.values(this.config.language_specific)) {
				patterns.push(...langConfig.folders)
				patterns.push(...langConfig.files)
			}
		}

		return [...new Set(patterns)] // Remove duplicates
	}

	/**
	 * Check if a file should be excluded based on size
	 */
	shouldExcludeBySize(fileSizeBytes: number): boolean {
		const sizeLimits = this.config.exclusions.size_limits
		if (!sizeLimits) return false

		return fileSizeBytes > sizeLimits.max_file_size_bytes
	}

	/**
	 * Get inclusion override patterns
	 */
	getInclusionOverrides(): string[] {
		return this.config.inclusion_overrides?.patterns || []
	}

	/**
	 * Get custom rules
	 */
	getCustomRules(): CustomRules {
		return this.config.custom_rules || {
			exclude_test_files: false,
			exclude_documentation: false,
			exclude_config_files: false,
			exclude_sample_data: true,
		}
	}

	/**
	 * Get content-based rules
	 */
	getContentBasedRules(): ContentBasedRules {
		return this.config.exclusions.content_based || {
			binary_files: true,
			empty_files: false,
			minified_files: true,
		}
	}

	/**
	 * Validate exclusion patterns
	 */
	static validatePatterns(config: ExclusionConfig): {
		isValid: boolean
		validPatterns: number
		invalidPatterns: string[]
	} {
		const invalidPatterns: string[] = []
		let validPatterns = 0

		// Helper function to validate a single pattern
		const validatePattern = (pattern: string, type: string): boolean => {
			try {
				// Basic validation - check for obviously invalid patterns
				if (!pattern || pattern.trim().length === 0) {
					invalidPatterns.push(`${type}: Empty pattern`)
					return false
				}

				// Check for invalid regex characters that might cause issues
				// Allow glob wildcards (* and ?) as they are expected in patterns
				const problematicChars = /[<>"|\x00-\x1f]/
				if (problematicChars.test(pattern)) {
					invalidPatterns.push(`${type}: "${pattern}" contains invalid characters`)
					return false
				}

				// Try to create a regex from the pattern to test validity
				const regexPattern = pattern
					.replace(/\*\*/g, '.*')
					.replace(/\*/g, '[^/]*')
					.replace(/\?/g, '.')
					.replace(/\./g, '\\.')

				new RegExp(regexPattern)
				validPatterns++
				return true
			} catch (error) {
				invalidPatterns.push(`${type}: "${pattern}" - ${error instanceof Error ? error.message : 'Invalid pattern'}`)
				return false
			}
		}

		// Validate all pattern types
		config.exclusions.folders.patterns.forEach(pattern =>
			validatePattern(pattern, 'folder'))
		config.exclusions.files.patterns.forEach(pattern =>
			validatePattern(pattern, 'file'))
		config.exclusions.extensions.patterns.forEach(pattern =>
			validatePattern(pattern, 'extension'))
		config.exclusions.exact_names.patterns.forEach(pattern =>
			validatePattern(pattern, 'exact_name'))

		// Validate language-specific patterns
		if (config.language_specific) {
			Object.entries(config.language_specific).forEach(([lang, langConfig]) => {
				langConfig.folders.forEach(pattern =>
					validatePattern(pattern, `${lang}_folder`))
				langConfig.files.forEach(pattern =>
					validatePattern(pattern, `${lang}_file`))
			})
		}

		// Validate inclusion overrides
		if (config.inclusion_overrides) {
			config.inclusion_overrides.patterns.forEach(pattern =>
				validatePattern(pattern, 'inclusion_override'))
		}

		return {
			isValid: invalidPatterns.length === 0,
			validPatterns,
			invalidPatterns
		}
	}

	/**
	 * Reload configuration from file
	 */
	async reload(): Promise<void> {
		if (!this.configPath) {
			logger.warn('No config path set, cannot reload')
			return
		}

		const newManager = await ExclusionConfigManager.loadFromFile(this.configPath)
		this.config = newManager.config
		logger.info('Exclusion configuration reloaded')
	}
}
