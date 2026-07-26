import { describe, expect, it } from 'vitest'
import { classifySwapError } from './mobileWallet'

/**
 * These cover the acceptance criterion for the error-visibility work: no raw
 * provider string may reach the DOM. Every user-visible message must come from
 * `classifySwapError`, so anything it returns has to be free of viem framing
 * (`Version: viem@x.y.z`, `Details:` prefixes, stack traces, multi-line bodies).
 */

/** Shape of a real viem error: long, multi-line, version-stamped. */
function viemError(shortMessage: string, extra: Partial<Record<string, unknown>> = {}) {
  const err = new Error(
    `${shortMessage}\n\nDetails: some provider detail\nVersion: viem@2.51.0`
  )
  Object.assign(err, { shortMessage, ...extra })
  return err
}

describe('classifySwapError', () => {
  describe('failure mode C — mobile wallet tab inactive', () => {
    it('maps EIP-1193 "requested resource not available" to actionable copy', () => {
      const err = viemError('Requested resource not available.', {
        details: 'Tab tidak aktif',
      })
      const result = classifySwapError(err)

      expect(result.code).toBe('WALLET_TAB_INACTIVE')
      expect(result.message).toBe('Return to this tab, then try again.')
    })

    it('does not leak the viem version string into the message', () => {
      const err = viemError('Requested resource not available.')
      expect(classifySwapError(err).message).not.toContain('viem@')
    })
  })

  describe('failure mode A — revert reasons must survive', () => {
    it('surfaces a nested revert reason rather than the outer message', () => {
      const err = new Error('execution reverted')
      Object.assign(err, { cause: { cause: { reason: 'INSUFFICIENT_OUTPUT_AMOUNT' } } })

      const result = classifySwapError(err)
      expect(result.code).toBe('SIMULATION_REVERTED')
      expect(result.message).toContain('INSUFFICIENT_OUTPUT_AMOUNT')
    })

    it('classifies an allowance revert ahead of the generic revert branch', () => {
      const err = new Error('execution reverted')
      Object.assign(err, { cause: { reason: 'ERC20: transfer amount exceeds allowance' } })

      const result = classifySwapError(err)
      expect(result.code).toBe('INSUFFICIENT_ALLOWANCE')
    })

    it('classifies a balance revert', () => {
      const err = new Error('execution reverted')
      Object.assign(err, { cause: { reason: 'ERC20: transfer amount exceeds balance' } })

      expect(classifySwapError(err).code).toBe('INSUFFICIENT_BALANCE')
    })
  })

  describe('failure mode B — RPC pressure', () => {
    it('maps HTTP 429 to a wait-and-retry message', () => {
      const result = classifySwapError(viemError('HTTP request failed. Status code: 429'))
      expect(result.code).toBe('RPC_RATE_LIMITED')
      expect(result.message).toBe('RPC is busy. Please wait a moment and try again.')
    })

    it('maps a timeout', () => {
      expect(classifySwapError(viemError('The request timed out.')).code).toBe('RPC_TIMEOUT')
    })

    it('maps a generic transport failure', () => {
      expect(classifySwapError(viemError('HTTP request failed.')).code).toBe('RPC_UNAVAILABLE')
    })
  })

  it('detects user rejection before anything else', () => {
    const err = viemError('User rejected the request.')
    expect(classifySwapError(err).code).toBe('USER_REJECTED')
    expect(classifySwapError(err).message).toBe('Rejected by user')
  })

  describe('fallback is still DOM-safe', () => {
    it('collapses an unrecognised multi-line error to its first line', () => {
      const err = new Error('Something odd happened\nDetails: internal\nVersion: viem@2.51.0')
      const result = classifySwapError(err)

      expect(result.code).toBe('UNKNOWN')
      expect(result.message).toBe('Something odd happened')
      expect(result.message).not.toContain('\n')
      expect(result.message).not.toContain('viem@')
    })

    it('caps an overlong single-line error at 150 characters', () => {
      const result = classifySwapError(new Error('x'.repeat(400)))
      expect(result.message).toHaveLength(151) // 150 chars + ellipsis
      expect(result.message.endsWith('…')).toBe(true)
    })

    it('handles non-Error values without throwing', () => {
      expect(classifySwapError(undefined).message).toBe('Unknown error')
      expect(classifySwapError(null).message).toBe('Unknown error')
      expect(classifySwapError('plain string').code).toBe('UNKNOWN')
    })
  })
})
