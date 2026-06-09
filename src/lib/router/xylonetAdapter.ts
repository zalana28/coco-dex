import { EXTERNAL_DEXES } from '@/config/externalDexes'
import { EURC, USDC } from '@/config/tokens'
import type { Token } from '@/types/token'
import { formatTokenAmount } from '@/utils/format'
import { calculateMinimumReceived } from '@/utils/price'
import type { RouteAvailabilityStatus, RouteQuote, RouteUnavailableReason } from './types'
import { DEFAULT_ROUTE_TTL_MS, getRouteHealthStatus } from './routeMetadata'

/**
 * XyloNet Router ABI — corrected to match on-chain contract.
 *
 * getAmountOut uses 3 parameters (tokenIn, tokenOut, amountIn).
 * The router resolves the pool internally for quotes — no pool address needed.
 * Correct selector: 0x4aa06652.
 *
 * The deployed router does not expose the docs-stated
 * swap(address,address,address,uint256,uint256,address,uint256) selector.
 * Its bytecode exposes the standard swapExactTokensForTokens selector (0x38ed1739),
 * which succeeds in simulation with path [tokenIn, tokenOut].
 */
export const XYLONET_ROUTER_ABI = [
  {
    type: 'function',
    name: 'getAmountOut',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'swapExactTokensForTokens',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const

export function isXyloNetPairSupported(tokenIn: Token, tokenOut: Token): boolean {
  const tokenInAddress = tokenIn.address.toLowerCase()
  const tokenOutAddress = tokenOut.address.toLowerCase()
  const usdcAddress = USDC.address.toLowerCase()
  const eurcAddress = EURC.address.toLowerCase()

  return (
    (tokenInAddress === usdcAddress && tokenOutAddress === eurcAddress) ||
    (tokenInAddress === eurcAddress && tokenOutAddress === usdcAddress)
  )
}

type BuildXyloNetQuoteParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  amountOut?: bigint
  slippageBps: number
  isLoading?: boolean
  error?: unknown
}

export function buildXyloNetRouteQuote({
  tokenIn,
  tokenOut,
  amountIn,
  amountOut,
  slippageBps,
  isLoading = false,
  error,
}: BuildXyloNetQuoteParams): RouteQuote {
  const xylonet = EXTERNAL_DEXES.xylonet
  const isSupportedPair = isXyloNetPairSupported(tokenIn, tokenOut)
  const hasAmount = amountIn > BigInt(0)
  const hasQuote = Boolean(amountOut && amountOut > BigInt(0))

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

  const safeAmountOut = amountOut && amountOut > BigInt(0) ? amountOut : BigInt(0)

  return {
    id: 'xylonet-usdc-eurc',
    source: 'xylonet',
    label: xylonet.label,
    inputToken: tokenIn,
    outputToken: tokenOut,
    amountIn,
    amountOut: safeAmountOut,
    amountOutFormatted: safeAmountOut > BigInt(0) ? formatTokenAmount(safeAmountOut, tokenOut.decimals) : '-',
    minAmountOut: safeAmountOut > BigInt(0) ? calculateMinimumReceived(safeAmountOut, slippageBps) : BigInt(0),
    routePath: [tokenIn.symbol, tokenOut.symbol],
    quoteTimestamp: Date.now(),
    ttlMs: DEFAULT_ROUTE_TTL_MS,
    healthStatus: getRouteHealthStatus(availabilityStatus),
    warnings: availabilityStatus === 'available'
      ? ['This swap executes through XyloNet router and requires a separate token approval.']
      : [],
    routerAddress: xylonet.routerAddress,
    poolAddress: xylonet.usdcEurcPoolAddress,
    isExecutable: availabilityStatus === 'available',
    executable: availabilityStatus === 'available',
    availabilityStatus,
    executionStatus: availabilityStatus === 'available' ? 'executable' : 'non_executable',
    unavailableReason,
    warning: availabilityStatus === 'available'
      ? 'This swap executes through XyloNet router and requires a separate token approval.'
      : undefined,
  }
}
