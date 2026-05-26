import { describe, it, expect } from 'vitest'
import { formatTokenAmount, parseTokenAmount, truncateAddress, formatCompact, formatPercentage } from './format'

describe('formatTokenAmount', () => {
  it('formats bigint with 6 decimals correctly', () => {
    expect(formatTokenAmount(BigInt(1000000), 6)).toBe('1')
    expect(formatTokenAmount(BigInt(1500000), 6)).toBe('1.5')
    expect(formatTokenAmount(BigInt(1234567), 6)).toBe('1.234567')
    expect(formatTokenAmount(BigInt(100), 6)).toBe('0.0001')
  })

  it('formats zero correctly', () => {
    expect(formatTokenAmount(BigInt(0), 6)).toBe('0')
  })

  it('formats number input', () => {
    expect(formatTokenAmount(1.5, 6)).toBe('1.5')
    expect(formatTokenAmount(0.000001, 6)).toBe('0.000001')
  })

  it('handles large amounts', () => {
    expect(formatTokenAmount(BigInt(1000000_000000), 6)).toBe('1000000')
  })
})

describe('parseTokenAmount', () => {
  it('parses whole numbers', () => {
    expect(parseTokenAmount('1', 6)).toBe(BigInt(1_000000))
    expect(parseTokenAmount('100', 6)).toBe(BigInt(100_000000))
  })

  it('parses decimals', () => {
    expect(parseTokenAmount('1.5', 6)).toBe(BigInt(1_500000))
    expect(parseTokenAmount('0.000001', 6)).toBe(BigInt(1))
  })

  it('handles empty/invalid input', () => {
    expect(parseTokenAmount('', 6)).toBe(BigInt(0))
    expect(parseTokenAmount('.', 6)).toBe(BigInt(0))
  })

  it('truncates extra decimals', () => {
    expect(parseTokenAmount('1.1234567890', 6)).toBe(BigInt(1_123456))
  })
})

describe('truncateAddress', () => {
  it('truncates standard Ethereum address', () => {
    expect(truncateAddress('0x1234567890abcdef1234567890abcdef12345678'))
      .toBe('0x1234...5678')
  })

  it('handles short strings', () => {
    expect(truncateAddress('0x1234')).toBe('0x1234')
  })
})

describe('formatCompact', () => {
  it('formats millions', () => {
    expect(formatCompact(1_500_000)).toBe('$1.5M')
  })

  it('formats thousands', () => {
    expect(formatCompact(890_000)).toBe('$890K')
  })

  it('formats small numbers', () => {
    expect(formatCompact(50)).toBe('$50.00')
  })
})

describe('formatPercentage', () => {
  it('formats percentage with decimals', () => {
    expect(formatPercentage(12.345)).toBe('12.35%')
    expect(formatPercentage(0.05)).toBe('0.05%')
  })
})
