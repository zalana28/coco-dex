import { EXTERNAL_DEXES } from '@/config/externalDexes'
import { EURC, USDC } from '@/config/tokens'
import type { Token } from '@/types/token'
import { formatTokenAmount } from '@/utils/format'
import { calculateMinimumReceived } from '@/utils/price'
import type { RouteAvailabilityStatus, RouteQuote, RouteUnavailableReason } from './types'

export const XYLONET_ROUTER_ABI = [
  {
    type: 'function',
    name: 'getAmountOut',
    stateMutability: 'view',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'swap',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
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
    amountIn,
    amountOut: safeAmountOut,
    amountOutFormatted: safeAmountOut > BigInt(0) ? formatTokenAmount(safeAmountOut, tokenOut.decimals) : '-',
    minAmountOut: safeAmountOut > BigInt(0) ? calculateMinimumReceived(safeAmountOut, slippageBps) : BigInt(0),
    routePath: [tokenIn.symbol, tokenOut.symbol],
    routerAddress: xylonet.routerAddress,
    poolAddress: xylonet.usdcEurcPoolAddress,
    isExecutable: false,
    availabilityStatus,
    executionStatus: 'non_executable',
    unavailableReason,
    warning: availabilityStatus === 'available' ? 'Execution coming soon' : undefined,
  }
}
