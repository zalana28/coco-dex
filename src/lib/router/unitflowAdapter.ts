import { EXTERNAL_DEXES } from '@/config/externalDexes'
import { EURC, USDC } from '@/config/tokens'
import { UNITFLOW_WUSDC_ADDRESS } from '@/config/unitflow'
import type { Token } from '@/types/token'
import { formatTokenAmount } from '@/utils/format'
import { calculateMinimumReceived } from '@/utils/price'
import type { RouteAvailabilityStatus, RouteQuote, RouteUnavailableReason } from './types'
import { DEFAULT_ROUTE_TTL_MS, getRouteHealthStatus } from './routeMetadata'

export const UNITFLOW_V25_ROUTER_ABI = [
  {
    type: 'function',
    name: 'getAmountsOut',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const

const WUSDC_DECIMAL_SCALE = 1_000_000_000_000n

/**
 * Maximum plausible output ratio: if amountOut/amountIn (in same-decimal
 * token units) exceeds this factor, the pool is considered to have
 * insufficient or severely imbalanced liquidity and the quote is rejected.
 *
 * Audit finding (2026-07): The UnitFlow WUSDC/EURC pair had r0(WUSDC) ≈ 1e-6
 * WUSDC equivalent, making getAmountsOut return astronomically large EURC
 * values (1.3M EURC per 1 USDC). A swap would fail on-chain; we surface
 * this as insufficient_liquidity before simulation.
 *
 * 10× is generous — a healthy stable-ish pool should output 0.7–1.3×
 * the input for a 1:1 pegged pair.
 */
const MAX_REASONABLE_OUTPUT_RATIO = 10n

type UnitFlowQuoteRequest = {
  amountIn: bigint
  path: readonly [`0x${string}`, `0x${string}`]
}

type BuildUnitFlowQuoteParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  amountsOut?: readonly bigint[]
  slippageBps: number
  isLoading?: boolean
  error?: unknown
}

export function isUnitFlowPairSupported(tokenIn: Token, tokenOut: Token): boolean {
  const tokenInAddress = tokenIn.address.toLowerCase()
  const tokenOutAddress = tokenOut.address.toLowerCase()
  const usdcAddress = USDC.address.toLowerCase()
  const eurcAddress = EURC.address.toLowerCase()

  return (
    (tokenInAddress === usdcAddress && tokenOutAddress === eurcAddress) ||
    (tokenInAddress === eurcAddress && tokenOutAddress === usdcAddress)
  )
}

export function getUnitFlowV25QuoteRequest(tokenIn: Token, tokenOut: Token, amountIn: bigint): UnitFlowQuoteRequest | undefined {
  if (amountIn <= BigInt(0) || !isUnitFlowPairSupported(tokenIn, tokenOut)) return undefined

  const tokenInAddress = tokenIn.address.toLowerCase()
  const usdcAddress = USDC.address.toLowerCase()

  if (tokenInAddress === usdcAddress) {
    return {
      amountIn: amountIn * WUSDC_DECIMAL_SCALE,
      path: [UNITFLOW_WUSDC_ADDRESS, EURC.address as `0x${string}`],
    }
  }

  return {
    amountIn,
    path: [EURC.address as `0x${string}`, UNITFLOW_WUSDC_ADDRESS],
  }
}

function normalizeUnitFlowAmountOut(tokenOut: Token, amountOut?: bigint): bigint {
  if (!amountOut || amountOut <= BigInt(0)) return BigInt(0)

  const isUsdcOutput = tokenOut.address.toLowerCase() === USDC.address.toLowerCase()
  if (!isUsdcOutput) return amountOut

  return amountOut / WUSDC_DECIMAL_SCALE
}

/**
 * Detect whether the pool has grossly imbalanced or insufficient liquidity.
 *
 * Returns true (insufficient) when the normalised output exceeds
 * MAX_REASONABLE_OUTPUT_RATIO × the input.  Both values are in the same
 * 6-decimal token units after normalisation so the ratio is dimensionless.
 *
 * This catches the on-chain state where one reserve is near zero and the
 * AMM formula returns an absurdly large output that would revert on execution.
 */
function isUnitFlowLiquidityInsufficient(amountIn: bigint, safeAmountOut: bigint): boolean {
  if (amountIn <= 0n || safeAmountOut <= 0n) return false
  return safeAmountOut > amountIn * MAX_REASONABLE_OUTPUT_RATIO
}

function isUnitFlowUniversalRouterExecutable(tokenIn: Token, tokenOut: Token, availabilityStatus: RouteAvailabilityStatus): boolean {
  return (
    availabilityStatus === 'available' &&
    tokenIn.address.toLowerCase() === USDC.address.toLowerCase() &&
    tokenOut.address.toLowerCase() === EURC.address.toLowerCase()
  )
}

export function buildUnitFlowRouteQuote({
  tokenIn,
  tokenOut,
  amountIn,
  amountsOut,
  slippageBps,
  isLoading = false,
  error,
}: BuildUnitFlowQuoteParams): RouteQuote {
  const unitflow = EXTERNAL_DEXES.unitflow
  const isSupportedPair = isUnitFlowPairSupported(tokenIn, tokenOut)
  const hasAmount = amountIn > BigInt(0)
  const rawAmountOut = amountsOut?.[amountsOut.length - 1]
  const safeAmountOut = normalizeUnitFlowAmountOut(tokenOut, rawAmountOut)
  const hasQuote = safeAmountOut > BigInt(0)

  let availabilityStatus: RouteAvailabilityStatus = 'available'
  let unavailableReason: RouteUnavailableReason | undefined
  let insufficientLiquidity = false

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
  } else if (isUnitFlowLiquidityInsufficient(amountIn, safeAmountOut)) {
    // Pool reserve is critically imbalanced: the AMM returns a nonsensical
    // output (e.g. 1.3M EURC per 1 USDC) that would revert on execution.
    // Surface this as unavailable so the aggregator never auto-selects it.
    availabilityStatus = 'unavailable'
    unavailableReason = 'No active USDC/EURC pool'
    insufficientLiquidity = true
  }

  const minAmountOut = safeAmountOut > BigInt(0) && !insufficientLiquidity
    ? calculateMinimumReceived(safeAmountOut, slippageBps)
    : BigInt(0)
  const isExecutable = isUnitFlowUniversalRouterExecutable(tokenIn, tokenOut, availabilityStatus)

  return {
    id: 'unitflow-v25-wusdc-eurc',
    source: 'unitflow',
    label: unitflow.label,
    inputToken: tokenIn,
    outputToken: tokenOut,
    amountIn,
    amountOut: insufficientLiquidity ? BigInt(0) : safeAmountOut,
    amountOutFormatted: insufficientLiquidity ? '-' : safeAmountOut > BigInt(0) ? formatTokenAmount(safeAmountOut, tokenOut.decimals) : '-',
    minAmountOut,
    routePath: [tokenIn.symbol, 'WUSDC', tokenOut.symbol],
    quoteTimestamp: Date.now(),
    ttlMs: DEFAULT_ROUTE_TTL_MS,
    healthStatus: getRouteHealthStatus(availabilityStatus),
    warnings: availabilityStatus === 'available'
      ? [isExecutable ? 'Executes through UnitFlow UniversalRouter with native USDC wrapping.' : 'Execution coming soon']
      : [],
    routerAddress: unitflow.v25.swapRouterAddress,
    isExecutable,
    executable: isExecutable,
    availabilityStatus,
    executionStatus: isExecutable ? 'executable' : 'non_executable',
    unavailableReason,
    blockedReason: insufficientLiquidity ? 'Simulation missing' : undefined,
    warning: availabilityStatus === 'available'
      ? isExecutable
        ? 'Executes through UnitFlow UniversalRouter with native USDC wrapping.'
        : 'Execution coming soon'
      : insufficientLiquidity
        ? 'UnitFlow liquidity is insufficient for this trade.'
        : undefined,
  }
}
