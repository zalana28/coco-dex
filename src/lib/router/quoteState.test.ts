import { describe, expect, it } from 'vitest'
import {
  classifyQuoteError,
  detectSharedRpcOutage,
  getRetryConfig,
  isTransientRpcError,
  quoteStateLabel,
  quoteStateSeverity,
  resolveQuoteState,
  type QuoteErrorCategory,
} from './quoteState'

describe('quoteState classification', () => {
  describe('classifyQuoteError', () => {
    it('classifies timeout errors', () => {
      expect(classifyQuoteError(new Error('Request timed out'))).toBe('rpc-timeout')
      expect(classifyQuoteError('timeout after 30s')).toBe('rpc-timeout')
    })

    it('classifies rate limit errors', () => {
      expect(classifyQuoteError(new Error('429 Too Many Requests'))).toBe('rpc-rate-limit')
      expect(classifyQuoteError('rate limit exceeded')).toBe('rpc-rate-limit')
    })

    it('classifies disconnection errors', () => {
      expect(classifyQuoteError(new Error('fetch failed'))).toBe('rpc-disconnected')
      expect(classifyQuoteError('network connection lost')).toBe('rpc-disconnected')
    })

    it('classifies contract reverts', () => {
      expect(classifyQuoteError(new Error('execution reverted: INSUFFICIENT_OUTPUT'))).toBe('contract-revert')
    })

    it('classifies no-liquidity', () => {
      expect(classifyQuoteError(new Error('insufficient liquidity'))).toBe('no-liquidity')
      expect(classifyQuoteError('INSUFFICIENT_OUTPUT')).toBe('no-liquidity')
    })

    it('classifies malformed responses', () => {
      expect(classifyQuoteError(new Error('could not decode result'))).toBe('malformed-response')
    })

    it('classifies unknown errors as sanitized', () => {
      expect(classifyQuoteError(new Error('something weird'))).toBe('unknown-sanitized')
      expect(classifyQuoteError(null)).toBe('unknown-sanitized')
      expect(classifyQuoteError(undefined)).toBe('unknown-sanitized')
    })

    it('never exposes credentialed URLs', () => {
      const cat = classifyQuoteError(new Error('failed to reach https://user:pass@rpc.example/?apiKey=SECRET'))
      expect(cat).not.toContain('user')
      expect(cat).not.toContain('SECRET')
    })
  })

  describe('isTransientRpcError', () => {
    it('returns true for timeout', () => {
      expect(isTransientRpcError('rpc-timeout')).toBe(true)
    })

    it('returns true for rate-limit', () => {
      expect(isTransientRpcError('rpc-rate-limit')).toBe(true)
    })

    it('returns false for contract-revert', () => {
      expect(isTransientRpcError('contract-revert')).toBe(false)
    })

    it('returns false for no-liquidity', () => {
      expect(isTransientRpcError('no-liquidity')).toBe(false)
    })
  })

  describe('resolveQuoteState', () => {
    it('returns loading when no data and loading', () => {
      expect(resolveQuoteState({ hasData: false, hasError: false, isLoading: true, hasPreviousData: false })).toBe('loading')
    })

    it('returns retrying when has data and loading', () => {
      expect(resolveQuoteState({ hasData: true, hasError: false, isLoading: true, hasPreviousData: true })).toBe('retrying')
    })

    it('returns fresh when has data and not loading', () => {
      expect(resolveQuoteState({ hasData: true, hasError: false, isLoading: false, hasPreviousData: true })).toBe('fresh')
    })

    it('returns stale-cached when error but previous data exists', () => {
      expect(resolveQuoteState({ hasData: false, hasError: true, isLoading: false, hasPreviousData: true, errorCategory: 'rpc-timeout' })).toBe('stale-cached')
    })

    it('returns unavailable-rpc when error and no previous data (transient)', () => {
      expect(resolveQuoteState({ hasData: false, hasError: true, isLoading: false, hasPreviousData: false, errorCategory: 'rpc-timeout' })).toBe('unavailable-rpc')
    })

    it('returns unavailable-no-liquidity when no-liquidity error and no previous data', () => {
      expect(resolveQuoteState({ hasData: false, hasError: true, isLoading: false, hasPreviousData: false, errorCategory: 'no-liquidity' })).toBe('unavailable-no-liquidity')
    })

    it('returns unavailable-contract-revert for revert without previous data', () => {
      expect(resolveQuoteState({ hasData: false, hasError: true, isLoading: false, hasPreviousData: false, errorCategory: 'contract-revert' })).toBe('unavailable-contract-revert')
    })

    it('returns idle when nothing', () => {
      expect(resolveQuoteState({ hasData: false, hasError: false, isLoading: false, hasPreviousData: false })).toBe('idle')
    })
  })

  describe('quoteStateLabel', () => {
    it('shows fresh for fresh state', () => {
      expect(quoteStateLabel('fresh')).toBe('Fresh quote')
    })

    it('shows loading for loading state', () => {
      expect(quoteStateLabel('loading')).toBe('Loading quote')
    })

    it('shows retrying for retrying state', () => {
      expect(quoteStateLabel('retrying')).toBe('Retrying quote')
    })

    it('shows last quote with age for stale-cached', () => {
      expect(quoteStateLabel('stale-cached', 5_000)).toBe('Last quote · 5s ago')
      expect(quoteStateLabel('stale-cached', 120_000)).toBe('Last quote · 2m ago')
      expect(quoteStateLabel('stale-cached')).toBe('Last quote · stale')
    })

    it('shows no available liquidity for no-liquidity', () => {
      expect(quoteStateLabel('unavailable-no-liquidity')).toBe('No available liquidity')
    })

    it('shows RPC temporarily unavailable for rpc failure', () => {
      expect(quoteStateLabel('unavailable-rpc')).toBe('RPC temporarily unavailable')
    })
  })

  describe('quoteStateSeverity', () => {
    it('returns normal for fresh', () => {
      expect(quoteStateSeverity('fresh')).toBe('normal')
    })

    it('returns neutral for stale-cached', () => {
      expect(quoteStateSeverity('stale-cached')).toBe('neutral')
    })

    it('returns neutral for unavailable-rpc', () => {
      expect(quoteStateSeverity('unavailable-rpc')).toBe('neutral')
    })

    it('returns neutral for unavailable-no-liquidity', () => {
      expect(quoteStateSeverity('unavailable-no-liquidity')).toBe('neutral')
    })

    it('returns danger for contract-revert', () => {
      expect(quoteStateSeverity('unavailable-contract-revert')).toBe('danger')
    })

    it('returns danger for disabled', () => {
      expect(quoteStateSeverity('disabled')).toBe('danger')
    })
  })

  describe('detectSharedRpcOutage', () => {
    it('returns true when 2+ providers fail with transient RPC errors within window', () => {
      const now = Date.now()
      const failures = [
        { provider: 'xylonet', timestamp: now - 3_000, category: 'rpc-timeout' as QuoteErrorCategory },
        { provider: 'unitflow', timestamp: now - 2_000, category: 'rpc-disconnected' as QuoteErrorCategory },
      ]
      expect(detectSharedRpcOutage(failures, 10_000, now)).toBe(true)
    })

    it('returns false when only 1 provider fails', () => {
      const now = Date.now()
      const failures = [
        { provider: 'xylonet', timestamp: now - 3_000, category: 'rpc-timeout' as QuoteErrorCategory },
      ]
      expect(detectSharedRpcOutage(failures, 10_000, now)).toBe(false)
    })

    it('returns false when failures are outside the time window', () => {
      const now = Date.now()
      const failures = [
        { provider: 'xylonet', timestamp: now - 30_000, category: 'rpc-timeout' as QuoteErrorCategory },
        { provider: 'unitflow', timestamp: now - 29_000, category: 'rpc-disconnected' as QuoteErrorCategory },
      ]
      expect(detectSharedRpcOutage(failures, 10_000, now)).toBe(false)
    })

    it('returns false when failures are deterministic (not transient)', () => {
      const now = Date.now()
      const failures = [
        { provider: 'xylonet', timestamp: now - 3_000, category: 'contract-revert' as QuoteErrorCategory },
        { provider: 'unitflow', timestamp: now - 2_000, category: 'no-liquidity' as QuoteErrorCategory },
      ]
      expect(detectSharedRpcOutage(failures, 10_000, now)).toBe(false)
    })
  })

  describe('getRetryConfig', () => {
    it('returns shouldRetry=true for attempt 0', () => {
      const config = getRetryConfig(0)
      expect(config.shouldRetry).toBe(true)
      expect(config.delayMs).toBeGreaterThan(0)
    })

    it('returns shouldRetry=true for attempt 2', () => {
      const config = getRetryConfig(2)
      expect(config.shouldRetry).toBe(true)
    })

    it('returns shouldRetry=false for attempt 3 (max)', () => {
      const config = getRetryConfig(3)
      expect(config.shouldRetry).toBe(false)
      expect(config.delayMs).toBe(0)
    })

    it('caps delay at 8 seconds', () => {
      const config = getRetryConfig(10)
      expect(config.delayMs).toBeLessThanOrEqual(8_000)
    })
  })

  describe('stale quote safety', () => {
    it('stale-cached state has neutral severity (not danger)', () => {
      expect(quoteStateSeverity('stale-cached')).not.toBe('danger')
    })

    it('stale-cached label shows age', () => {
      const label = quoteStateLabel('stale-cached', 18_000)
      expect(label).toBe('Last quote · 18s ago')
    })

    it('no-liquidity differs from rpc-timeout in classification', () => {
      expect(classifyQuoteError('insufficient liquidity')).not.toBe(classifyQuoteError('timeout'))
    })

    it('contract-revert differs from timeout in classification', () => {
      expect(classifyQuoteError('execution reverted')).not.toBe(classifyQuoteError('timeout'))
    })

    it('one timeout does not classify as shared outage', () => {
      const now = Date.now()
      const failures = [
        { provider: 'xylonet', timestamp: now - 1_000, category: 'rpc-timeout' as QuoteErrorCategory },
      ]
      expect(detectSharedRpcOutage(failures, 10_000, now)).toBe(false)
    })
  })
})
