export type ParseBooleanOptions = {
  default?: boolean
}

const TRUE_SET = new Set(['true', '1', 'yes', 'on'])
const FALSE_SET = new Set(['false', '0', 'no', 'off'])

/**
 * Robust boolean parser for environment variables.
 * - Accepts: true/false, 1/0, yes/no, on/off (case-insensitive)
 * - Returns options.default (false by default) when input is unset/invalid
 */
export function parseBoolean(input: unknown, options: ParseBooleanOptions = {}): boolean {
  const def = options.default ?? false
  if (input === undefined || input === null) return def

  if (typeof input === 'boolean') return input
  if (typeof input === 'number') return input !== 0

  if (typeof input === 'string') {
    const v = input.trim().toLowerCase()
    if (TRUE_SET.has(v)) return true
    if (FALSE_SET.has(v)) return false
  }

  return def
}

/**
 * Returns whether the input string is a recognized boolean literal per parseBoolean
 */
export function isRecognizedBooleanLiteral(input: unknown): boolean {
  if (typeof input !== 'string') return false
  const v = input.trim().toLowerCase()
  return TRUE_SET.has(v) || FALSE_SET.has(v)
}

