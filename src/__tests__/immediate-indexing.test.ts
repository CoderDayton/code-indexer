import { resolveImmediateIndexingFromEnv } from '../config/immediate-indexing.js'

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const saved: Record<string, string | undefined> = {}
  for (const k of Object.keys(vars)) saved[k] = process.env[k]
  Object.assign(process.env, vars)
  try { return fn() } finally { Object.assign(process.env, saved) }
}

describe('resolveImmediateIndexingFromEnv', () => {
  test('defaults to false when unset', () => {
    const result = withEnv({ IMMEDIATE_INDEXING_ENABLED: undefined }, () => resolveImmediateIndexingFromEnv(process.env))
    expect(result.effective).toBe(false)
    expect(result.source).toBe('default')
  })

  test('accepts true variants', () => {
    for (const v of ['true', '1', 'yes', 'on', 'TrUe']) {
      const result = withEnv({ IMMEDIATE_INDEXING_ENABLED: v }, () => resolveImmediateIndexingFromEnv(process.env))
      expect(result.effective).toBe(true)
      expect(result.source).toBe('IMMEDIATE_INDEXING_ENABLED')
    }
  })

  test('accepts false variants', () => {
    for (const v of ['false', '0', 'no', 'off', 'FaLsE']) {
      const result = withEnv({ IMMEDIATE_INDEXING_ENABLED: v }, () => resolveImmediateIndexingFromEnv(process.env))
      expect(result.effective).toBe(false)
      expect(result.source).toBe('IMMEDIATE_INDEXING_ENABLED')
    }
  })

  test('invalid primary falls back to default false', () => {
    const result = withEnv({ IMMEDIATE_INDEXING_ENABLED: 'maybe' }, () => resolveImmediateIndexingFromEnv(process.env))
    expect(result.effective).toBe(false)
    expect(result.source).toBe('default')
  })

  test('legacy alias honored with deprecation when primary unset', () => {
    const result = withEnv({ IMMEDIATE_INDEXING_ENABLED: undefined, IMMEDIATE_INDEXING: 'yes' }, () => resolveImmediateIndexingFromEnv(process.env))
    expect(result.effective).toBe(true)
    expect(result.source).toBe('IMMEDIATE_INDEXING')
  })

  test('primary has precedence over legacy', () => {
    const result = withEnv({ IMMEDIATE_INDEXING_ENABLED: 'false', IMMEDIATE_INDEXING: 'yes' }, () => resolveImmediateIndexingFromEnv(process.env))
    expect(result.effective).toBe(false)
    expect(result.source).toBe('IMMEDIATE_INDEXING_ENABLED')
  })
})

