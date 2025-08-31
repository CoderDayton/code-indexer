import { QdrantClient } from '@qdrant/js-client-rest';
import { Config } from './config.js';
import { ICodeIndexer } from './ICodeIndexer.js';
interface IndexStats {
    totalFiles: number;
    indexedFiles: number;
    failedFiles: number;
    totalSize: number;
    indexedSize: number;
    lastIndexed: string;
}
export declare class CodeIndexer implements ICodeIndexer {
    private qdrantClient;
    private collectionName;
    private embeddingConfig;
    private ollamaClient;
    private logger;
    private config;
    private indexingQueue;
    private maxConcurrency;
    private currentConcurrency;
    private incrementalStateFile;
    private incrementalState;
    private metadataFile;
    private stats;
    constructor(qdrantClient: QdrantClient, collectionName: string, config: Config);
    private loadIncrementalState;
    private saveIncrementalState;
    private loadMetadata;
    private saveMetadata;
    private generateFileChecksum;
    private needsIndexing;
    generateEmbedding(text: string): Promise<number[]>;
    private generateFileId;
    private waitForSlot;
    private releaseSlot;
    indexFile(filePath: string): Promise<void>;
    private doIndexFile;
    indexFiles(filePaths: string[]): Promise<{
        successful: string[];
        failed: string[];
    }>;
    search(query: string, limit?: number): Promise<any[]>;
    validateIndexState(): Promise<void>;
    getStats(): IndexStats & {
        incrementalStateSize: number;
    };
    clearIncrementalState(): void;
    getIndexingStatus(): {
        queueSize: number;
        currentConcurrency: number;
        maxConcurrency: number;
    };
    reindexAll(directory: string): Promise<void>;
    deleteFileFromIndex(filePath: string): Promise<void>;
    getAllFiles(directory: string): Promise<string[]>;
}
export {};
//# sourceMappingURL=CodeIndexer.d.ts.map