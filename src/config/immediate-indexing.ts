import { getLogger } from '../logger.js'
import { parseBoolean, isRecognizedBooleanLiteral } from '../utils/booleans.js'

export type ImmediateIndexingConfig = {
  effective: boolean
  source: 'IMMEDIATE_INDEXING_ENABLED' | 'IMMEDIATE_INDEXING' | 'START_INDEXING_ON_STARTUP' | 'default'
  raw?: string
  deprecatedUsed?: boolean
}

const LEGACY_VARS = ['IMMEDIATE_INDEXING', 'START_INDEXING_ON_STARTUP'] as const

export function resolveImmediateIndexingFromEnv(env: NodeJS.ProcessEnv): ImmediateIndexingConfig {
  const logger = getLogger('ImmediateIndexing')

  const primaryRaw = env.IMMEDIATE_INDEXING_ENABLED
  const primary = parseBoolean(primaryRaw, { default: false })

  // Check legacy vars only if primary is not explicitly set to a recognized boolean literal
  let legacyHit: { name: typeof LEGACY_VARS[number]; raw: string | undefined; value: boolean } | null = null
  if (!(typeof primaryRaw === 'string' && isRecognizedBooleanLiteral(primaryRaw))) {
    for (const name of LEGACY_VARS) {
      const raw = env[name]
      if (raw !== undefined) {
        legacyHit = { name, raw, value: parseBoolean(raw, { default: false }) }
        break
      }
    }
  }

  if (typeof primaryRaw === 'string' && isRecognizedBooleanLiteral(primaryRaw)) {
    const effective = primary
    return { effective, source: 'IMMEDIATE_INDEXING_ENABLED', raw: primaryRaw }
  }

  if (legacyHit) {
    logger.warn(
      `${legacyHit.name} is deprecated. Please use IMMEDIATE_INDEXING_ENABLED instead. Using legacy value for now.`,
      { legacyVar: legacyHit.name, raw: legacyHit.raw }
    )
    return {
      effective: legacyHit.value,
      source: legacyHit.name,
      raw: legacyHit.raw,
      deprecatedUsed: true,
    }
  }

  if (typeof primaryRaw === 'string' && primaryRaw.trim() !== '' && !isRecognizedBooleanLiteral(primaryRaw)) {
    logger.warn(
      'Invalid value for IMMEDIATE_INDEXING_ENABLED; expected one of: true,false,1,0,yes,no,on,off. Defaulting to false.',
      { raw: primaryRaw }
    )
  }

  return { effective: false, source: 'default' }
}

