import { ICodeIndexer } from './ICodeIndexer.js';
interface WatchingConfig {
    ignorePatterns: string[];
}
export declare class FileWatcher {
    private indexer;
    private config;
    private watcher;
    constructor(indexer: ICodeIndexer, config: WatchingConfig);
    startWatching(directory: string): void;
    stopWatching(): void;
    isWatching(): boolean;
}
export {};
//# sourceMappingURL=FileWatcher.d.ts.map