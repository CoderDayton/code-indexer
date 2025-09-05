import { jest } from '@jest/globals'
import { onStartup, __resetImmediateIndexingForTests } from '../startup.js'

describe('startup immediate indexing wiring', () => {
  beforeEach(() => {
    __resetImmediateIndexingForTests()
  })

  function makeServer(spy: jest.Mock) {
    return {
      reindexAll: spy,
    } as any
  }

  const baseConfig: any = {
    app: { baseDirectory: undefined }
  }

  test('does not trigger when flag disabled', async () => {
    const spy = jest.fn().mockResolvedValue(undefined)
    const server = makeServer(spy)

    const saved = process.env.IMMEDIATE_INDEXING_ENABLED
    process.env.IMMEDIATE_INDEXING_ENABLED = 'false'
    try {
      await onStartup(server, baseConfig)
      expect(spy).not.toHaveBeenCalled()
    } finally {
      if (saved === undefined) delete process.env.IMMEDIATE_INDEXING_ENABLED
      else process.env.IMMEDIATE_INDEXING_ENABLED = saved
    }
  })

  test('triggers exactly once when enabled', async () => {
    const spy = jest.fn().mockResolvedValue(undefined)
    const server = makeServer(spy)

    const saved = process.env.IMMEDIATE_INDEXING_ENABLED
    process.env.IMMEDIATE_INDEXING_ENABLED = 'true'
    try {
      await onStartup(server, baseConfig)
      await onStartup(server, baseConfig)
      // Allow microtask to run
      await Promise.resolve()
      expect(spy).toHaveBeenCalledTimes(1)
    } finally {
      if (saved === undefined) delete process.env.IMMEDIATE_INDEXING_ENABLED
      else process.env.IMMEDIATE_INDEXING_ENABLED = saved
    }
  })
})
