#!/usr/bin/env node
import { CodeIndexerServer } from './CodeIndexerServer.js';
import { loadConfig } from './config.js';
async function main() {
    try {
        const config = loadConfig();
        const server = new CodeIndexerServer(config);
        await server.initialize();
        console.error('Code Indexer MCP Server initialized');
        await server.startServer();
    }
    catch (error) {
        console.error('Error initializing server:', error);
        process.exit(1);
    }
}
main().catch(console.error);
//# sourceMappingURL=index.js.map