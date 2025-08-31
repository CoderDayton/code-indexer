interface QdrantConfig {
    url: string;
    apiKey?: string;
    https?: boolean;
    timeout?: number;
    retries?: number;
}
interface EmbeddingConfig {
    model: string;
    dimensions: number;
    chunkSize?: number;
    chunkOverlap?: number;
}
interface WatchingConfig {
    ignorePatterns: string[];
    debounceMs?: number;
    enableWatching?: boolean;
}
interface ServerConfig {
    port: number;
}
interface OllamaConfig {
    host: string;
    timeout?: number;
    retries?: number;
}
interface IndexingConfig {
    batchSize: number;
    maxConcurrency: number;
    incrementalEnabled: boolean;
    persistMetadata: boolean;
    validationEnabled: boolean;
}
interface LoggingConfig {
    level: 'debug' | 'info' | 'warn' | 'error';
    file?: string;
    console: boolean;
}
export interface Config {
    qdrant: QdrantConfig;
    embedding: EmbeddingConfig;
    watching: WatchingConfig;
    server: ServerConfig;
    ollama: OllamaConfig;
    indexing: IndexingConfig;
    logging: LoggingConfig;
    collectionName: string;
    baseDirectory: string;
}
declare class ConfigManager {
    private static instance;
    private config;
    private lastLoadTime;
    private reloadInterval;
    private constructor();
    static getInstance(): ConfigManager;
    loadConfig(): Config;
    reloadConfig(): Config;
    setReloadInterval(interval: number): void;
    getConfig(): Config;
    updateBaseDirectory(newBaseDirectory: string): void;
    private createConfig;
}
export declare function loadConfig(): Config;
export { ConfigManager };
//# sourceMappingURL=config.d.ts.map