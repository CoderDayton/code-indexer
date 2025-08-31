import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
dotenv.config();
function detectBaseDirectory() {
    const workspaceFile = process.env.VSCODE_WORKSPACE;
    if (workspaceFile && fs.existsSync(workspaceFile)) {
        return path.dirname(workspaceFile);
    }
    const baseDir = process.env.BASE_DIRECTORY;
    if (baseDir && fs.existsSync(baseDir)) {
        return path.resolve(baseDir);
    }
    return process.cwd();
}
class ConfigManager {
    constructor() {
        this.config = null;
        this.lastLoadTime = 0;
        this.reloadInterval = 60000;
    }
    static getInstance() {
        if (!ConfigManager.instance) {
            ConfigManager.instance = new ConfigManager();
        }
        return ConfigManager.instance;
    }
    loadConfig() {
        const now = Date.now();
        if (!this.config || now - this.lastLoadTime > this.reloadInterval) {
            this.config = this.createConfig();
            this.lastLoadTime = now;
        }
        return this.config;
    }
    reloadConfig() {
        this.config = this.createConfig();
        this.lastLoadTime = Date.now();
        return this.config;
    }
    setReloadInterval(interval) {
        this.reloadInterval = interval;
    }
    getConfig() {
        return this.loadConfig();
    }
    updateBaseDirectory(newBaseDirectory) {
        process.env.BASE_DIRECTORY = newBaseDirectory;
        this.reloadConfig();
    }
    createConfig() {
        return {
            ollama: {
                host: process.env.OLLAMA_HOST || 'http://localhost:11434',
                timeout: parseInt(process.env.OLLAMA_TIMEOUT || '30000'),
                retries: parseInt(process.env.OLLAMA_RETRIES || '3'),
            },
            qdrant: {
                url: process.env.QDRANT_URL || 'http://localhost:6333',
                apiKey: process.env.QDRANT_API_KEY,
                https: process.env.QDRANT_HTTPS === 'true',
                timeout: parseInt(process.env.QDRANT_TIMEOUT || '30000'),
                retries: parseInt(process.env.QDRANT_RETRIES || '3'),
            },
            embedding: {
                model: process.env.OLLAMA_MODEL || 'nomic-embed-text:v1.5',
                dimensions: parseInt(process.env.EMBEDDING_DIMENSIONS || '768'),
                chunkSize: parseInt(process.env.CHUNK_SIZE || '1000'),
                chunkOverlap: parseInt(process.env.CHUNK_OVERLAP || '200'),
            },
            indexing: {
                batchSize: parseInt(process.env.BATCH_SIZE || '10'),
                maxConcurrency: parseInt(process.env.MAX_CONCURRENCY || '5'),
                incrementalEnabled: process.env.ENABLE_INCREMENTAL_INDEXING !== 'false',
                persistMetadata: process.env.PERSIST_METADATA !== 'false',
                validationEnabled: process.env.VALIDATION_ENABLED !== 'false',
            },
            watching: {
                ignorePatterns: (process.env.IGNORE_PATTERNS ||
                    'node_modules/**,*.git/**,dist/**,build/**,*.log,*.tmp').split(','),
                debounceMs: parseInt(process.env.DEBOUNCE_MS || '1000'),
                enableWatching: process.env.WATCH_ENABLED !== 'false',
            },
            logging: {
                level: (process.env.LOG_LEVEL || 'info'),
                file: process.env.LOG_FILE_PATH || path.join(process.cwd(), 'logs', 'indexer.log'),
                console: process.env.ENABLE_CONSOLE_LOGGING !== 'false',
            },
            server: {
                port: parseInt(process.env.SERVER_PORT || '3000'),
            },
            baseDirectory: detectBaseDirectory(),
            collectionName: process.env.COLLECTION_NAME || 'code_chunks',
        };
    }
}
export function loadConfig() {
    return ConfigManager.getInstance().loadConfig();
}
export { ConfigManager };
//# sourceMappingURL=config.js.map