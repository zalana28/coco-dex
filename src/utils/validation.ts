/**
 * Input validation utilities for swap and liquidity forms.
 *
 * All token amounts in the Coco DEX use ERC-20 decimals (6 for USDC/EURC).
 * These validators ensure user input is safe before conversion to bigint.
 */

export interface ValidationResult {
  valid: boolean
  error: string | null
}

/**
 * Validate a token amount input string.
 *
 * Rejects:
 * - Empty/whitespace-only strings
 * - Negative values
 * - NaN / non-numeric values
 * - Zero amounts (when rejectZero = true)
 * - Malformed decimals (e.g., "1.2.3", "1.", trailing dots allowed for typing)
 * - More decimal places than the token supports
 */
export function validateTokenAmount(
  value: string,
  tokenDecimals: number,
  options: { rejectZero?: boolean; allowTrailingDot?: boolean } = {}
): ValidationResult {
  const { rejectZero = true, allowTrailingDot = true } = options

  // Trim whitespace
  const trimmed = value.trim()

  // Empty input
  if (trimmed === '') {
    return { valid: false, error: 'Enter an amount' }
  }

  // Allow trailing dot while user is typing (e.g., "1.")
  if (allowTrailingDot && trimmed.endsWith('.') && trimmed.indexOf('.') === trimmed.length - 1) {
    const wholePart = trimmed.slice(0, -1)
    if (wholePart === '' || !/^\d+$/.test(wholePart)) {
      return { valid: false, error: 'Invalid amount' }
    }
    // Trailing dot is valid for typing, treat as partial input
    return { valid: true, error: null }
  }

  // Must match: optional digits, optional decimal point with digits
  const validPattern = /^\d+(\.\d+)?$/
  if (!validPattern.test(trimmed)) {
    return { valid: false, error: 'Invalid amount' }
  }

  // Parse as number for numeric checks
  const num = parseFloat(trimmed)

  // NaN check (shouldn't happen with regex but be safe)
  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, error: 'Invalid amount' }
  }

  // Negative check
  if (num < 0) {
    return { valid: false, error: 'Amount cannot be negative' }
  }

  // Zero check
  if (rejectZero && num === 0) {
    return { valid: false, error: 'Amount must be greater than zero' }
  }

  // Decimal places check
  const parts = trimmed.split('.')
  if (parts.length === 2 && parts[1]!.length > tokenDecimals) {
    return { valid: false, error: `Maximum ${tokenDecimals} decimal places` }
  }

  return { valid: true, error: null }
}

/**
 * Sanitize input as the user types.
 * Returns a cleaned string or null if the input should be rejected entirely.
 *
 * Allows partial inputs like "" (empty), "0.", "12." for UX while typing.
 * Strips leading zeros (except "0.xxx"), rejects multiple dots, letters, negatives.
 */
export function sanitizeTokenInput(value: string, tokenDecimals: number): string | null {
  // Allow empty (user clearing field)
  if (value === '') return ''

  // Reject if contains anything other than digits and one dot
  if (!/^[\d.]*$/.test(value)) return null

  // Reject multiple dots
  if ((value.match(/\./g) || []).length > 1) return null

  // Reject negative sign (should be impossible with type="number" but guard)
  if (value.includes('-')) return null

  // Strip leading zeros unless it's "0" or "0.xxx"
  let cleaned = value
  if (cleaned.length > 1 && cleaned.startsWith('0') && cleaned[1] !== '.') {
    cleaned = cleaned.replace(/^0+/, '') || '0'
  }

  // Enforce max decimals
  const parts = cleaned.split('.')
  if (parts.length === 2 && parts[1]!.length > tokenDecimals) {
    cleaned = `${parts[0]}.${parts[1]!.slice(0, tokenDecimals)}`
  }

  return cleaned
}

/**
 * Validate slippage tolerance value.
 * Must be between 0.01% and 5%.
 */
export function validateSlippage(value: number): ValidationResult {
  if (isNaN(value) || !isFinite(value)) {
    return { valid: false, error: 'Invalid slippage' }
  }
  if (value < 0.01) {
    return { valid: false, error: 'Minimum slippage is 0.01%' }
  }
  if (value > 5) {
    return { valid: false, error: 'Maximum slippage is 5%' }
  }
  return { valid: true, error: null }
}

/**
 * Validate transaction deadline in minutes.
 * Must be between 1 and 180 minutes.
 */
export function validateDeadline(minutes: number): ValidationResult {
  if (isNaN(minutes) || !isFinite(minutes)) {
    return { valid: false, error: 'Invalid deadline' }
  }
  if (minutes < 1) {
    return { valid: false, error: 'Minimum deadline is 1 minute' }
  }
  if (minutes > 180) {
    return { valid: false, error: 'Maximum deadline is 180 minutes' }
  }
  if (!Number.isInteger(minutes)) {
    return { valid: false, error: 'Deadline must be a whole number' }
  }
  return { valid: true, error: null }
}
