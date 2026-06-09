import { COCO_STABLE_POOL } from '@/config/cocoStablePool'
import { EURC, USDC } from '@/config/tokens'
import type { Token } from '@/types/token'
import { formatTokenAmount } from '@/utils/format'
import { calculateMinimumReceived } from '@/utils/price'
import { evaluateNativeStableRouteGuard } from './cocoStablePoolGuard'
import { ROUTER_SHADOW_MODE_CONFIG } from './routerConfig'
import type { RouteQuote } from './types'

type BuildCocoStableShadowQuoteParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  amountOut?: bigint
  slippageBps: number
  benchmarkQuote?: RouteQuote
  isLoading?: boolean
  error?: unknown
  nowMs?: number
}

export function isCocoStablePairSupported(tokenIn: Token, tokenOut: Token): boolean {
  const tokenInAddress = tokenIn.address.toLowerCase()
  const tokenOutAddress = tokenOut.address.toLowerCase()
  const usdcAddress = USDC.address.toLowerCase()
  const eurcAddress = EURC.address.toLowerCase()

  return (
    (tokenInAddress === usdcAddress && tokenOutAddress === eurcAddress) ||
    (tokenInAddress === eurcAddress && tokenOutAddress === usdcAddress)
  )
}

export function buildCocoStableShadowRouteQuote({
  tokenIn,
  tokenOut,
  amountIn,
  amountOut,
  slippageBps,
  benchmarkQuote,
  isLoading = false,
  error,
  nowMs = Date.now(),
}: BuildCocoStableShadowQuoteParams): RouteQuote {
  const isSupportedPair = isCocoStablePairSupported(tokenIn, tokenOut)
  const hasAmount = amountIn > 0n
  const safeAmountOut = amountOut && amountOut > 0n ? amountOut : 0n
  const hasQuote = safeAmountOut > 0n

  let availabilityStatus: RouteQuote['availabilityStatus'] = 'available'
  let unavailableReason: RouteQuote['unavailableReason'] | undefined

  if (!hasAmount) {
    availabilityStatus = 'unavailable'
    unavailableReason = 'Amount required'
  } else if (!isSupportedPair) {
    availabilityStatus = 'unavailable'
    unavailableReason = 'Unsupported pair'
  } else if (isLoading && !hasQuote) {
    availabilityStatus = 'loading'
  } else if (error) {
    availabilityStatus = 'unavailable'
    unavailableReason = 'Contract read failed'
  } else if (!hasQuote) {
    availabilityStatus = 'unavailable'
    unavailableReason = 'No quote returned'
  }

  const quoteForGuard = {
    amountIn,
    amountOut: safeAmountOut,
    quoteTimestamp: nowMs,
    ttlMs: ROUTER_SHADOW_MODE_CONFIG.nativeStable.quoteTtlMs,
    healthStatus: availabilityStatus === 'available' ? 'healthy' as const : 'unavailable' as const,
  }
  const guard = evaluateNativeStableRouteGuard({
    quote: quoteForGuard,
    benchmarkQuote,
    nowMs,
    simulationStatus: 'missing',
  })
  const warnings = availabilityStatus === 'available'
    ? [...guard.warnings]
    : []

  return {
    id: COCO_STABLE_POOL.id,
    source: 'coco_stable',
    label: 'Coco Native Stable',
    inputToken: tokenIn,
    outputToken: tokenOut,
    amountIn,
    amountOut: safeAmountOut,
    amountOutFormatted: safeAmountOut > 0n ? formatTokenAmount(safeAmountOut, tokenOut.decimals) : '-',
    minAmountOut: safeAmountOut > 0n ? calculateMinimumReceived(safeAmountOut, slippageBps) : 0n,
    routePath: [tokenIn.symbol, 'CocoStablePool V1', tokenOut.symbol],
    feeBps: COCO_STABLE_POOL.feeBps,
    quoteTimestamp: nowMs,
    ttlMs: ROUTER_SHADOW_MODE_CONFIG.nativeStable.quoteTtlMs,
    healthStatus: quoteForGuard.healthStatus,
    warnings,
    poolAddress: COCO_STABLE_POOL.poolAddress,
    isExecutable: false,
    executable: false,
    availabilityStatus,
    executionStatus: 'non_executable',
    unavailableReason,
    blockedReason: availabilityStatus === 'available' ? guard.blockedReason ?? 'Quote-only beta' : undefined,
    warning: availabilityStatus === 'available'
      ? (guard.blockedReason ?? 'Quote-only beta')
      : undefined,
  }
}
