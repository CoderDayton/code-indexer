import { parseBoolean, isRecognizedBooleanLiteral } from '../utils/booleans.js'

describe('parseBoolean', () => {
  const truthy = ['true', 'TRUE', 'True', '1', 'yes', 'on', ' YeS ']
  const falsy = ['false', 'FALSE', '0', 'no', 'off', ' Off ']
  const invalid = ['tru', '2', 'maybe', '', '  ']

  test('parses truthy values', () => {
    for (const v of truthy) {
      expect(parseBoolean(v)).toBe(true)
    }
  })

  test('parses falsy values', () => {
    for (const v of falsy) {
      expect(parseBoolean(v, { default: true })).toBe(false)
    }
  })

  test('defaults when unset/invalid', () => {
    expect(parseBoolean(undefined)).toBe(false)
    expect(parseBoolean(null as any)).toBe(false)
    expect(parseBoolean('unknown', { default: true })).toBe(true)
  })

  test('recognizes literals', () => {
    expect(isRecognizedBooleanLiteral('true')).toBe(true)
    expect(isRecognizedBooleanLiteral('off')).toBe(true)
    expect(isRecognizedBooleanLiteral('unknown')).toBe(false)
  })
})

