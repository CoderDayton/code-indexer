import * as chokidar from 'chokidar';
export class FileWatcher {
    constructor(indexer, config) {
        this.indexer = indexer;
        this.config = config;
        this.watcher = null;
    }
    startWatching(directory) {
        try {
            if (this.watcher) {
                this.stopWatching();
            }
            this.watcher = chokidar.watch(directory, {
                ignored: this.config.ignorePatterns,
                persistent: true,
            });
            this.watcher
                .on('add', async (filePath) => {
                console.log(`File ${filePath} has been added`);
                try {
                    await this.indexer.indexFile(filePath);
                }
                catch (error) {
                    console.error(`Failed to index added file ${filePath}:`, error);
                }
            })
                .on('change', async (filePath) => {
                console.log(`File ${filePath} has been changed`);
                try {
                    await this.indexer.indexFile(filePath);
                }
                catch (error) {
                    console.error(`Failed to reindex changed file ${filePath}:`, error);
                }
            })
                .on('unlink', async (filePath) => {
                console.log(`File ${filePath} has been removed`);
                try {
                    await this.indexer.deleteFileFromIndex(filePath);
                }
                catch (error) {
                    console.error(`Failed to remove deleted file ${filePath} from index:`, error);
                }
            })
                .on('error', (error) => {
                console.error(`File watcher error:`, error);
            });
            console.log(`Started watching directory: ${directory}`);
        }
        catch (error) {
            console.error(`Failed to start watching directory ${directory}:`, error);
            throw new Error(`Failed to start watching: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    stopWatching() {
        if (this.watcher) {
            this.watcher
                .close()
                .then(() => {
                console.log('File watcher closed successfully');
            })
                .catch((error) => {
                console.error('Error closing file watcher:', error);
            });
            this.watcher = null;
            console.log('Stopped watching');
        }
    }
    isWatching() {
        return !!this.watcher;
    }
}
//# sourceMappingURL=FileWatcher.js.map