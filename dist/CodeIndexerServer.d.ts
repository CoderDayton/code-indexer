import { Config } from './config.js';
interface StatusResponse {
    watching: boolean;
    collectionName: string;
    qdrantUrl: string;
    embeddingModel: string;
    qdrantConnected: boolean;
    ollamaHost: string;
}
export declare class CodeIndexerServer {
    private config;
    private configManager;
    private qdrantClient;
    private collectionName;
    private indexer;
    private watcher;
    private mcpServer;
    private transport;
    private logger;
    constructor(config?: Config);
    private setupTools;
    private handleIndexSpecificFiles;
    private handleRetrieveData;
    private handleReindexAll;
    private handleStartWatching;
    private handleStopWatching;
    private handleGetStatus;
    initialize(): Promise<void>;
    indexSpecificFiles(filePaths: string[]): Promise<void>;
    retrieveData(query: string, topK?: number): Promise<any[]>;
    reindexAll(directory?: string): Promise<void>;
    getStatus(): Promise<StatusResponse>;
    startWatching(directory: string): void;
    stopWatching(): void;
    startServer(): Promise<void>;
    stopServer(): Promise<void>;
}
export {};
//# sourceMappingURL=CodeIndexerServer.d.ts.map