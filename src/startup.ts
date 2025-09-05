import { CodeIndexerServer } from './CodeIndexerServer.js'
import { Config } from './env/schema.js'
import { getLogger } from './logger.js'
import { resolveImmediateIndexingFromEnv } from './config/immediate-indexing.js'

let startupTriggered = false

export function __resetImmediateIndexingForTests() {
  startupTriggered = false
}

export async function onStartup(server: CodeIndexerServer, config: Config) {
  const logger = getLogger('Startup')
  const flag = resolveImmediateIndexingFromEnv(process.env)
  logger.info('Immediate indexing flag resolved', { source: flag.source, value: flag.effective })

  if (!flag.effective) {
    logger.info('Immediate indexing skipped (flag disabled)')
    return
  }

  if (startupTriggered) {
    logger.warn('Immediate indexing already triggered; skipping duplicate startup trigger')
    return
  }
  startupTriggered = true

  // Non-blocking trigger
  ;(async () => {
    try {
      logger.info('Immediate indexing enabled: starting initial indexing in background')
      const baseDir = config.app.baseDirectory || process.cwd()
      await server.reindexAll(baseDir)
      logger.info('Initial indexing completed')
    } catch (err) {
      logger.error('Immediate indexing failed', { error: err instanceof Error ? err.message : String(err) })
    }
  })()
}

