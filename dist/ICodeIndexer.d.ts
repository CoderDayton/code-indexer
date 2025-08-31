export interface ICodeIndexer {
    indexFile(filePath: string): Promise<void>;
    indexFiles(filePaths: string[]): Promise<{
        successful: string[];
        failed: string[];
    }>;
    search(query: string, topK?: number): Promise<any[]>;
    reindexAll(directory: string): Promise<void>;
    deleteFileFromIndex(filePath: string): Promise<void>;
    getAllFiles(directory: string): Promise<string[]>;
}
//# sourceMappingURL=ICodeIndexer.d.ts.map