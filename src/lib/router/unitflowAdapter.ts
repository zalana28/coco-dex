import { EXTERNAL_DEXES } from '@/config/externalDexes'
import { EURC, USDC } from '@/config/tokens'
import { UNITFLOW_WUSDC_ADDRESS } from '@/config/unitflow'
import type { Token } from '@/types/token'
import { formatTokenAmount } from '@/utils/format'
import { calculateMinimumReceived } from '@/utils/price'
import type { RouteAvailabilityStatus, RouteQuote, RouteUnavailableReason } from './types'

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

  const minAmountOut = safeAmountOut > BigInt(0)
    ? calculateMinimumReceived(safeAmountOut, slippageBps)
    : BigInt(0)
  const isExecutable = isUnitFlowUniversalRouterExecutable(tokenIn, tokenOut, availabilityStatus)

  return {
    id: 'unitflow-v25-wusdc-eurc',
    source: 'unitflow',
    label: unitflow.label,
    amountIn,
    amountOut: safeAmountOut,
    amountOutFormatted: safeAmountOut > BigInt(0) ? formatTokenAmount(safeAmountOut, tokenOut.decimals) : '-',
    minAmountOut,
    routePath: [tokenIn.symbol, 'WUSDC', tokenOut.symbol],
    routerAddress: unitflow.v25.swapRouterAddress,
    isExecutable,
    availabilityStatus,
    executionStatus: isExecutable ? 'executable' : 'non_executable',
    unavailableReason,
    warning: availabilityStatus === 'available'
      ? isExecutable
        ? 'Executes through UnitFlow UniversalRouter with native USDC wrapping.'
        : 'Execution coming soon'
      : undefined,
  }
}
