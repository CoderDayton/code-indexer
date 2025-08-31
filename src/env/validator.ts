import { ZodError } from 'zod'
import {
	EnvironmentSchema,
	ValidationResult,
	ValidationError,
	Environment,
} from './schema.js'

/**
 * Comprehensive environment variable validator
 * Provides detailed error reporting and validation
 */
export class EnvironmentValidator {
	/**
	 * Validate environment variables against the schema
	 * @param env Environment object to validate (defaults to process.env)
	 * @returns Validation result with success/error details
	 */
	static validate(
		env: Record<string, string | undefined> = process.env
	): ValidationResult {
		try {
			const data = EnvironmentSchema.parse(env)
			return {
				success: true,
				data,
			}
		} catch (error) {
			if (error instanceof ZodError) {
				const errors = this.formatZodErrors(error)
				return {
					success: false,
					errors,
				}
			}

			return {
				success: false,
				errors: [
					{
						field: 'unknown',
						message: error instanceof Error ? error.message : 'Unknown validation error',
					},
				],
			}
		}
	}

	/**
	 * Validate and throw on error
	 * @param env Environment object to validate
	 * @returns Validated environment data
	 * @throws EnvironmentValidationError
	 */
	static validateOrThrow(
		env: Record<string, string | undefined> = process.env
	): Environment {
		const result = this.validate(env)
		if (!result.success) {
			throw new EnvironmentValidationError(result.errors || [])
		}
		return result.data!
	}

	/**
	 * Format Zod errors into a more readable format
	 * @param error ZodError instance
	 * @returns Array of formatted validation errors
	 */
	private static formatZodErrors(error: ZodError): ValidationError[] {
		return error.issues.map((issue) => ({
			field: issue.path.join('.') || 'root',
			message: this.getHumanReadableMessage(issue),
			received: 'received' in issue ? issue.received : undefined,
			expected: this.getExpectedFormat(issue),
		}))
	}

	/**
	 * Convert Zod error messages to human-readable format
	 * @param issue Zod issue
	 * @returns Human-readable error message
	 */
	private static getHumanReadableMessage(issue: any): string {
		const field = issue.path.join('.') || 'field'

		switch (issue.code) {
			case 'invalid_type':
				return `${field}: Expected ${issue.expected}, received ${issue.received}`
			case 'too_small':
				return `${field}: Value must be at least ${issue.minimum}`
			case 'too_big':
				return `${field}: Value must be at most ${issue.maximum}`
			case 'invalid_string':
				if (issue.validation === 'url') {
					return `${field}: Must be a valid URL (e.g., https://example.com)`
				}
				if (issue.validation === 'regex') {
					return `${field}: Invalid format - ${
						issue.message || 'does not match required pattern'
					}`
				}
				return `${field}: ${issue.message || 'Invalid string format'}`
			case 'invalid_enum_value':
				return `${field}: Must be one of: ${issue.options.join(', ')}`
			default:
				return `${field}: ${issue.message || 'Validation failed'}`
		}
	}

	/**
	 * Get expected format description for an issue
	 * @param issue Zod issue
	 * @returns Expected format description
	 */
	private static getExpectedFormat(issue: any): string {
		const field = issue.path[0]

		// Field-specific format descriptions
		const formatDescriptions: Record<string, string> = {
			QDRANT_URL: 'Valid HTTPS URL (e.g., https://cluster.qdrant.io:6333)',
			QDRANT_API_KEY: 'JWT format API key (xxx.yyy.zzz)',
			OLLAMA_HOST: 'Valid HTTP/HTTPS URL (e.g., http://localhost:11434)',
			LOG_LEVEL: 'One of: debug, info, warn, error',
			NODE_ENV: 'One of: development, test, production',
			SERVER_PORT: 'Port number between 1024-65535',
			EMBEDDING_DIMENSIONS: 'Positive integer between 1-8192',
			CHUNK_SIZE: 'Positive integer between 100-10000',
			BATCH_SIZE: 'Positive integer between 1-100',
			MAX_CONCURRENCY: 'Positive integer between 1-20',
		}

		return formatDescriptions[field] || issue.expected || 'Valid value'
	}

	/**
	 * Generate detailed validation report
	 * @param env Environment object to validate
	 * @returns Detailed validation report
	 */
	static generateReport(env: Record<string, string | undefined> = process.env): string {
		const result = this.validate(env)

		if (result.success) {
			return '✅ All environment variables are valid'
		}

		const report = ['❌ Environment variable validation failed:', '']

		result.errors?.forEach((error, index) => {
			report.push(`${index + 1}. ${error.field}:`)
			report.push(`   Error: ${error.message}`)
			if (error.received !== undefined) {
				report.push(`   Received: ${error.received}`)
			}
			if (error.expected) {
				report.push(`   Expected: ${error.expected}`)
			}
			report.push('')
		})

		report.push('Troubleshooting:')
		report.push('1. Check your .env file for typos')
		report.push('2. Ensure all required variables are set')
		report.push('3. Verify URL formats include protocol (http/https)')
		report.push('4. Check numeric values are within allowed ranges')

		return report.join('\n')
	}

	/**
	 * Check if all required environment variables are present
	 * @param env Environment object to check
	 * @returns Object with missing and present variables
	 */
	static checkRequired(env: Record<string, string | undefined> = process.env): {
		missing: string[]
		present: string[]
		all: string[]
	} {
		const requiredFields = ['QDRANT_URL', 'QDRANT_API_KEY']
		const missing: string[] = []
		const present: string[] = []

		requiredFields.forEach((field) => {
			if (!env[field] || env[field]?.trim() === '') {
				missing.push(field)
			} else {
				present.push(field)
			}
		})

		return {
			missing,
			present,
			all: requiredFields,
		}
	}
}

/**
 * Custom error for environment validation failures
 */
export class EnvironmentValidationError extends Error {
	public readonly errors: ValidationError[]

	constructor(errors: ValidationError[]) {
		const message = `Environment validation failed: ${errors
			.map((e) => e.message)
			.join(', ')}`
		super(message)
		this.name = 'EnvironmentValidationError'
		this.errors = errors
	}

	/**
	 * Get detailed error report
	 */
	getDetailedReport(): string {
		return EnvironmentValidator.generateReport()
	}

	/**
	 * Get troubleshooting suggestions
	 */
	getTroubleshootingSuggestions(): string[] {
		const suggestions = [
			'Check your .env file exists and is in the correct location',
			'Verify all required environment variables are set: QDRANT_URL, QDRANT_API_KEY',
			'Ensure URLs include the protocol (http:// or https://)',
			'Check that numeric values are within the allowed ranges',
			'Remove any extra whitespace from environment variable values',
		]

		// Add specific suggestions based on error types
		this.errors.forEach((error) => {
			if (error.field === 'QDRANT_URL') {
				suggestions.push(
					'QDRANT_URL should include port number (e.g., https://cluster.qdrant.io:6333)'
				)
			}
			if (error.field === 'QDRANT_API_KEY') {
				suggestions.push(
					'QDRANT_API_KEY should be in JWT format with three parts separated by dots'
				)
			}
		})

		return [...new Set(suggestions)] // Remove duplicates
	}
}

/**
 * Quick validation function for simple use cases
 * @param env Environment object to validate
 * @returns Validated environment data or throws error
 */
export function validateEnvironment(
	env?: Record<string, string | undefined>
): Environment {
	return EnvironmentValidator.validateOrThrow(env)
}

/**
 * Safe validation function that returns result without throwing
 * @param env Environment object to validate
 * @returns Validation result
 */
export function safeValidateEnvironment(
	env?: Record<string, string | undefined>
): ValidationResult {
	return EnvironmentValidator.validate(env)
}
