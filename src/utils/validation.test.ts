import { describe, it, expect } from 'vitest'
import { validateTokenAmount, sanitizeTokenInput, validateSlippage, validateDeadline } from './validation'

describe('validateTokenAmount', () => {
  const USDC_DECIMALS = 6
  const EURC_DECIMALS = 6

  describe('rejects negative values', () => {
    it('rejects negative number string', () => {
      // Note: our regex already rejects '-' prefix since it expects ^\d+
      const result = validateTokenAmount('-1.5', USDC_DECIMALS)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Invalid amount')
    })
  })

  describe('rejects NaN / non-numeric', () => {
    it('rejects alphabetic input', () => {
      expect(validateTokenAmount('abc', USDC_DECIMALS).valid).toBe(false)
    })

    it('rejects special characters', () => {
      expect(validateTokenAmount('1e5', USDC_DECIMALS).valid).toBe(false)
    })

    it('rejects whitespace only', () => {
      expect(validateTokenAmount('   ', USDC_DECIMALS).valid).toBe(false)
    })
  })

  describe('rejects zero amount', () => {
    it('rejects "0"', () => {
      const result = validateTokenAmount('0', USDC_DECIMALS, { rejectZero: true })
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Amount must be greater than zero')
    })

    it('rejects "0.000000"', () => {
      const result = validateTokenAmount('0.000000', USDC_DECIMALS, { rejectZero: true })
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Amount must be greater than zero')
    })

    it('allows zero when rejectZero is false', () => {
      const result = validateTokenAmount('0', USDC_DECIMALS, { rejectZero: false })
      expect(result.valid).toBe(true)
    })
  })

  describe('rejects malformed decimal input', () => {
    it('rejects multiple dots', () => {
      expect(validateTokenAmount('1.2.3', USDC_DECIMALS).valid).toBe(false)
    })

    it('rejects dot-only', () => {
      expect(validateTokenAmount('.', USDC_DECIMALS).valid).toBe(false)
    })

    it('allows trailing dot for typing UX', () => {
      const result = validateTokenAmount('1.', USDC_DECIMALS, { allowTrailingDot: true })
      expect(result.valid).toBe(true)
    })
  })

  describe('prevents more decimals than token supports (6 for USDC/EURC)', () => {
    it('rejects 7 decimal places for USDC (6 decimals)', () => {
      const result = validateTokenAmount('1.1234567', USDC_DECIMALS)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Maximum 6 decimal places')
    })

    it('rejects 7 decimal places for EURC (6 decimals)', () => {
      const result = validateTokenAmount('0.1234567', EURC_DECIMALS)
      expect(result.valid).toBe(false)
      expect(result.error).toBe('Maximum 6 decimal places')
    })

    it('accepts exactly 6 decimal places', () => {
      expect(validateTokenAmount('1.123456', USDC_DECIMALS).valid).toBe(true)
    })

    it('accepts fewer than 6 decimal places', () => {
      expect(validateTokenAmount('1.12', USDC_DECIMALS).valid).toBe(true)
    })

    it('accepts the smallest valid amount (0.000001 = 1 unit at 6 decimals)', () => {
      expect(validateTokenAmount('0.000001', USDC_DECIMALS).valid).toBe(true)
    })
  })

  describe('accepts valid inputs', () => {
    it('accepts whole numbers', () => {
      expect(validateTokenAmount('100', USDC_DECIMALS).valid).toBe(true)
    })

    it('accepts large amounts', () => {
      expect(validateTokenAmount('1000000', USDC_DECIMALS).valid).toBe(true)
    })

    it('accepts decimal amounts', () => {
      expect(validateTokenAmount('99.50', USDC_DECIMALS).valid).toBe(true)
    })
  })
})

describe('sanitizeTokenInput', () => {
  const DECIMALS = 6

  it('allows empty string', () => {
    expect(sanitizeTokenInput('', DECIMALS)).toBe('')
  })

  it('rejects letters', () => {
    expect(sanitizeTokenInput('abc', DECIMALS)).toBeNull()
  })

  it('rejects negative sign', () => {
    expect(sanitizeTokenInput('-5', DECIMALS)).toBeNull()
  })

  it('rejects multiple dots', () => {
    expect(sanitizeTokenInput('1.2.3', DECIMALS)).toBeNull()
  })

  it('strips leading zeros', () => {
    expect(sanitizeTokenInput('007', DECIMALS)).toBe('7')
  })

  it('preserves "0.xxx" format', () => {
    expect(sanitizeTokenInput('0.5', DECIMALS)).toBe('0.5')
  })

  it('truncates excess decimals to 6', () => {
    expect(sanitizeTokenInput('1.12345678', DECIMALS)).toBe('1.123456')
  })

  it('allows partial decimal input', () => {
    expect(sanitizeTokenInput('1.', DECIMALS)).toBe('1.')
  })
})

describe('validateSlippage', () => {
  it('rejects below minimum (0.01%)', () => {
    const result = validateSlippage(0.001)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Minimum slippage is 0.01%')
  })

  it('rejects above maximum (5%)', () => {
    const result = validateSlippage(5.1)
    expect(result.valid).toBe(false)
    expect(result.error).toBe('Maximum slippage is 5%')
  })

  it('accepts default (0.5%)', () => {
    expect(validateSlippage(0.5).valid).toBe(true)
  })

  it('accepts minimum boundary (0.01%)', () => {
    expect(validateSlippage(0.01).valid).toBe(true)
  })

  it('accepts maximum boundary (5%)', () => {
    expect(validateSlippage(5).valid).toBe(true)
  })

  it('rejects NaN', () => {
    expect(validateSlippage(NaN).valid).toBe(false)
  })

  it('rejects Infinity', () => {
    expect(validateSlippage(Infinity).valid).toBe(false)
  })
})

describe('validateDeadline', () => {
  it('rejects below minimum (1 min)', () => {
    expect(validateDeadline(0).valid).toBe(false)
  })

  it('rejects above maximum (180 min)', () => {
    expect(validateDeadline(181).valid).toBe(false)
  })

  it('rejects non-integer', () => {
    expect(validateDeadline(5.5).valid).toBe(false)
  })

  it('accepts default (20 min)', () => {
    expect(validateDeadline(20).valid).toBe(true)
  })

  it('accepts boundary values', () => {
    expect(validateDeadline(1).valid).toBe(true)
    expect(validateDeadline(180).valid).toBe(true)
  })
})
