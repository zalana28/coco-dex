import { ROUTER_ADDRESS, USDC_EURC_PAIR_ADDRESS } from '@/config/contracts'
import { USDC } from '@/config/tokens'
import type { Token } from '@/types/token'
import { formatTokenAmount } from '@/utils/format'
import { calculateMinimumReceived, calculatePriceImpact, getAmountOut } from '@/utils/price'
import type { RouteBlockedReason, RouteQuote } from './types'
import { DEFAULT_ROUTE_TTL_MS } from './routeMetadata'

/**
 * Maximum acceptable price impact for Coco native pool auto-selection.
 *
 * Audit finding (2026-07): Coco USDC/EURC pair is imbalanced
 * (r0=85.3 USDC, r1=43.5 EURC, spot=0.51 vs ref=0.74).
 * A trade of 10 USDC already causes ~10% price impact.
 *
 * Above this threshold the route is marked non-executable and shown
 * with a "High price impact" warning so the user is not auto-routed
 * through a pool that will give them a bad rate.
 */
const COCO_MAX_PRICE_IMPACT_BPS = 300 // 3%

type GetCocoQuoteParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  reserveUsdc?: bigint
  reserveEurc?: bigint
  slippageBps: number
}

export function getCocoRouteQuote({
  tokenIn,
  tokenOut,
  amountIn,
  reserveUsdc,
  reserveEurc,
  slippageBps,
}: GetCocoQuoteParams): RouteQuote | undefined {
  if (amountIn <= BigInt(0) || !reserveUsdc || !reserveEurc) return undefined

  const isFromUsdc = tokenIn.address.toLowerCase() === USDC.address.toLowerCase()
  const reserveIn = isFromUsdc ? reserveUsdc : reserveEurc
  const reserveOut = isFromUsdc ? reserveEurc : reserveUsdc
  const amountOut = getAmountOut(amountIn, reserveIn, reserveOut)

  if (amountOut <= BigInt(0)) return undefined

  // Price impact check: if impact exceeds threshold, mark non-executable.
  const priceImpact = calculatePriceImpact(amountIn, amountOut, reserveIn, reserveOut)
  const priceImpactBps = Math.round(priceImpact * 100)
  const highPriceImpact = priceImpactBps > COCO_MAX_PRICE_IMPACT_BPS

  let blockedReason: RouteBlockedReason | undefined
  let warningText: string | undefined
  if (highPriceImpact) {
    blockedReason = 'Simulation missing'
    warningText = `High price impact (${priceImpact.toFixed(2)}%). Coco pool is imbalanced — use XyloNet or Synthra instead.`
  }

  return {
    id: 'coco-usdc-eurc',
    source: 'coco',
    label: 'Coco',
    inputToken: tokenIn,
    outputToken: tokenOut,
    amountIn,
    amountOut,
    amountOutFormatted: formatTokenAmount(amountOut, tokenOut.decimals),
    minAmountOut: calculateMinimumReceived(amountOut, slippageBps),
    routePath: [tokenIn.symbol, tokenOut.symbol],
    feeBps: 30,
    quoteTimestamp: Date.now(),
    ttlMs: DEFAULT_ROUTE_TTL_MS,
    healthStatus: highPriceImpact ? 'degraded' : 'healthy',
    warnings: warningText ? [warningText] : [],
    routerAddress: ROUTER_ADDRESS,
    poolAddress: USDC_EURC_PAIR_ADDRESS,
    isExecutable: !highPriceImpact,
    executable: !highPriceImpact,
    availabilityStatus: 'available',
    executionStatus: highPriceImpact ? 'non_executable' : 'executable',
    blockedReason,
    warning: warningText,
  }
}
