import { EXTERNAL_DEXES } from '@/config/externalDexes'
import { EURC, USDC } from '@/config/tokens'
import type { Token } from '@/types/token'
import { formatTokenAmount } from '@/utils/format'
import { calculateMinimumReceived } from '@/utils/price'
import type { RouteQuote, RouteQuoteStatus } from './types'

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
  isLoading: boolean
  readError?: Error | null
}

function getXyloNetStatus({
  tokenIn,
  tokenOut,
  amountIn,
  amountOut,
  isLoading,
  readError,
}: Omit<BuildXyloNetQuoteParams, 'slippageBps'>): { status: RouteQuoteStatus; errorMessage?: string } {
  if (!isXyloNetPairSupported(tokenIn, tokenOut)) return { status: 'unavailable', errorMessage: 'Unsupported pair' }
  if (amountIn <= BigInt(0)) return { status: 'unavailable', errorMessage: 'Amount required' }
  if (readError) return { status: 'unavailable', errorMessage: 'Contract read failed' }
  if (isLoading) return { status: 'loading' }
  if (!amountOut || amountOut <= BigInt(0)) return { status: 'unavailable', errorMessage: 'No quote returned' }
  return { status: 'available' }
}

export function buildXyloNetRouteQuote({
  tokenIn,
  tokenOut,
  amountIn,
  amountOut,
  slippageBps,
  isLoading,
  readError,
}: BuildXyloNetQuoteParams): RouteQuote {
  const xylonet = EXTERNAL_DEXES.xylonet
  const { status, errorMessage } = getXyloNetStatus({ tokenIn, tokenOut, amountIn, amountOut, isLoading, readError })
  const safeAmountOut = status === 'available' && amountOut ? amountOut : BigInt(0)

  return {
    id: 'xylonet-usdc-eurc',
    source: 'xylonet',
    label: xylonet.label,
    amountIn,
    amountOut: safeAmountOut,
    amountOutFormatted: status === 'available'
      ? formatTokenAmount(safeAmountOut, tokenOut.decimals)
      : status === 'loading'
        ? 'Loading quote'
        : 'Quote unavailable',
    minAmountOut: calculateMinimumReceived(safeAmountOut, slippageBps),
    routePath: [tokenIn.symbol, tokenOut.symbol],
    routerAddress: xylonet.routerAddress,
    poolAddress: xylonet.usdcEurcPoolAddress,
    isExecutable: false,
    status,
    executionStatus: 'non_executable',
    warning: status === 'available' ? 'Quote available, execution coming soon.' : undefined,
    errorMessage,
  }
}
