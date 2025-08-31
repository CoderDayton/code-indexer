/**
 * Interface for code indexing operations
 */
export interface ICodeIndexer {
	/**
	 * Index a single file
	 */
	indexFile(filePath: string): Promise<void>

	/**
	 * Index multiple files
	 */
	indexFiles(filePaths: string[]): Promise<{ successful: string[]; failed: string[] }>

	/**
	 * Search for code using vector similarity
	 */
	search(query: string, topK?: number): Promise<any[]>

	/**
	 * Reindex all files in a directory
	 */
	reindexAll(directory: string): Promise<void>

	/**
	 * Delete a file from the index
	 */
	deleteFileFromIndex(filePath: string): Promise<void>

	/**
	 * Get all files in a directory
	 */
	getAllFiles(directory: string): Promise<string[]>
}
