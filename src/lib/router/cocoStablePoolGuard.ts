import { ROUTER_SHADOW_MODE_CONFIG } from './routerConfig'
import type { RouteBlockedReason, RouteQuote } from './types'

export const COCO_STABLE_POOL_ROUTING_ENABLED = ROUTER_SHADOW_MODE_CONFIG.nativeStable.execute

type NativeStableGuardParams = {
  quote?: Pick<RouteQuote, 'amountIn' | 'amountOut' | 'quoteTimestamp' | 'ttlMs' | 'healthStatus'>
  benchmarkQuote?: Pick<RouteQuote, 'amountOut' | 'availabilityStatus' | 'healthStatus'>
  nowMs?: number
  simulationStatus?: 'missing' | 'failed' | 'passed'
  executeEnabled?: boolean
  maxInputCapEnabled?: boolean
  maxInputCapAmount?: bigint
  maxDeviationBps?: number
}

type NativeStableGuardResult = {
  executable: boolean
  blockedReason?: RouteBlockedReason
  warnings: string[]
}

function getDeviationBps(amountOut: bigint, benchmarkAmountOut: bigint) {
  if (benchmarkAmountOut <= 0n) return undefined
  const diff = amountOut > benchmarkAmountOut ? amountOut - benchmarkAmountOut : benchmarkAmountOut - amountOut
  return Number((diff * 10_000n) / benchmarkAmountOut)
}

export function evaluateNativeStableRouteGuard({
  quote,
  benchmarkQuote,
  nowMs = Date.now(),
  simulationStatus = 'missing',
  executeEnabled = ROUTER_SHADOW_MODE_CONFIG.nativeStable.execute,
  maxInputCapEnabled = ROUTER_SHADOW_MODE_CONFIG.nativeStable.maxInputCap.enabled,
  maxInputCapAmount = ROUTER_SHADOW_MODE_CONFIG.nativeStable.maxInputCap.amount,
  maxDeviationBps = ROUTER_SHADOW_MODE_CONFIG.nativeStable.benchmarkMaxDeviationBps,
}: NativeStableGuardParams): NativeStableGuardResult {
  const warnings: string[] = []

  if (!quote || quote.amountOut <= 0n) {
    return { executable: false, blockedReason: 'Quote missing', warnings: ['Quote missing'] }
  }

  if (nowMs - quote.quoteTimestamp > quote.ttlMs) {
    return { executable: false, blockedReason: 'Quote stale', warnings: ['Quote stale'] }
  }

  if (quote.healthStatus !== 'healthy') {
    return { executable: false, blockedReason: 'Source unhealthy', warnings: ['Source unhealthy'] }
  }

  if (maxInputCapEnabled && quote.amountIn > maxInputCapAmount) {
    return { executable: false, blockedReason: 'Input above beta cap', warnings: ['Input above beta cap'] }
  }

  if (!benchmarkQuote || benchmarkQuote.availabilityStatus !== 'available' || benchmarkQuote.healthStatus !== 'healthy' || benchmarkQuote.amountOut <= 0n) {
    return { executable: false, blockedReason: 'Benchmark unavailable', warnings: ['Benchmark unavailable'] }
  }

  const deviationBps = getDeviationBps(quote.amountOut, benchmarkQuote.amountOut)
  if (deviationBps !== undefined && deviationBps > maxDeviationBps) {
    return { executable: false, blockedReason: 'Benchmark deviation too high', warnings: ['Benchmark deviation too high'] }
  }

  if (simulationStatus === 'missing') {
    return { executable: false, blockedReason: 'Simulation missing', warnings: ['Simulation missing'] }
  }

  if (simulationStatus === 'failed') {
    return { executable: false, blockedReason: 'Simulation failed', warnings: ['Simulation failed'] }
  }

  if (!executeEnabled) {
    return { executable: false, blockedReason: 'Quote-only beta', warnings: ['Quote-only beta', 'Not routed'] }
  }

  return { executable: true, warnings }
}

export function isCocoStablePoolExecutableRoute() {
  return COCO_STABLE_POOL_ROUTING_ENABLED
}
