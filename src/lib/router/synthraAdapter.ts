import { EXTERNAL_DEXES } from '@/config/externalDexes'
import { SYNTHRA_QUOTE_FEE_TIERS } from '@/config/synthra'
import { EURC, USDC } from '@/config/tokens'
import type { Token } from '@/types/token'
import { formatTokenAmount } from '@/utils/format'
import { calculateMinimumReceived } from '@/utils/price'
import type { RouteAvailabilityStatus, RouteQuote, RouteUnavailableReason } from './types'
import { DEFAULT_ROUTE_TTL_MS, getRouteHealthStatus } from './routeMetadata'

export const SYNTHRA_V3_QUOTER_ABI = [
  {
    type: 'function',
    name: 'quoteExactInputSingle',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const

export type SynthraQuoteFeeTier = (typeof SYNTHRA_QUOTE_FEE_TIERS)[number]

type SynthraQuoteRequest = {
  tokenIn: `0x${string}`
  tokenOut: `0x${string}`
  amountIn: bigint
}

type SynthraFeeQuote = {
  fee: SynthraQuoteFeeTier
  amountOut?: bigint
}

type BuildSynthraQuoteParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  feeQuotes: SynthraFeeQuote[]
  slippageBps: number
  isLoading?: boolean
  error?: unknown
}

function formatFeeTier(fee?: SynthraQuoteFeeTier): string {
  if (!fee) return 'fee tier'
  return `${fee / 10_000}%`
}

export function isSynthraPairSupported(tokenIn: Token, tokenOut: Token): boolean {
  const tokenInAddress = tokenIn.address.toLowerCase()
  const tokenOutAddress = tokenOut.address.toLowerCase()
  const usdcAddress = USDC.address.toLowerCase()
  const eurcAddress = EURC.address.toLowerCase()

  return (
    (tokenInAddress === usdcAddress && tokenOutAddress === eurcAddress) ||
    (tokenInAddress === eurcAddress && tokenOutAddress === usdcAddress)
  )
}

export function getSynthraV3QuoteRequest(tokenIn: Token, tokenOut: Token, amountIn: bigint): SynthraQuoteRequest | undefined {
  if (amountIn <= BigInt(0) || !isSynthraPairSupported(tokenIn, tokenOut)) return undefined

  return {
    tokenIn: tokenIn.address as `0x${string}`,
    tokenOut: tokenOut.address as `0x${string}`,
    amountIn,
  }
}

export function buildSynthraRouteQuote({
  tokenIn,
  tokenOut,
  amountIn,
  feeQuotes,
  slippageBps,
  isLoading = false,
  error,
}: BuildSynthraQuoteParams): RouteQuote {
  const synthra = EXTERNAL_DEXES.synthra
  const isSupportedPair = isSynthraPairSupported(tokenIn, tokenOut)
  const hasAmount = amountIn > BigInt(0)
  const bestFeeQuote = feeQuotes.reduce<SynthraFeeQuote | undefined>((best, quote) => {
    if (!quote.amountOut || quote.amountOut <= BigInt(0)) return best
    if (!best?.amountOut || quote.amountOut > best.amountOut) return quote
    return best
  }, undefined)
  const safeAmountOut = bestFeeQuote?.amountOut ?? BigInt(0)
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
  } else if (error && !hasQuote) {
    availabilityStatus = 'unavailable'
    unavailableReason = 'Contract read failed'
  } else if (!hasQuote) {
    availabilityStatus = 'unavailable'
    unavailableReason = 'No quote returned'
  }

  const minAmountOut = safeAmountOut > BigInt(0)
    ? calculateMinimumReceived(safeAmountOut, slippageBps)
    : BigInt(0)

  return {
    id: bestFeeQuote ? `synthra-v3-${bestFeeQuote.fee}` : 'synthra-v3',
    source: 'synthra',
    label: synthra.label,
    inputToken: tokenIn,
    outputToken: tokenOut,
    amountIn,
    amountOut: safeAmountOut,
    amountOutFormatted: safeAmountOut > BigInt(0) ? formatTokenAmount(safeAmountOut, tokenOut.decimals) : '-',
    minAmountOut,
    routePath: [tokenIn.symbol, `Synthra V3 ${formatFeeTier(bestFeeQuote?.fee)}`, tokenOut.symbol],
    feeTier: bestFeeQuote?.fee,
    quoteTimestamp: Date.now(),
    ttlMs: DEFAULT_ROUTE_TTL_MS,
    healthStatus: getRouteHealthStatus(availabilityStatus),
    warnings: availabilityStatus === 'available'
      ? ['Executes through Synthra V3 swap router and requires token approval.']
      : [],
    routerAddress: synthra.v3.swapRouterAddress,
    isExecutable: availabilityStatus === 'available' && Boolean(bestFeeQuote?.fee),
    executable: availabilityStatus === 'available' && Boolean(bestFeeQuote?.fee),
    availabilityStatus,
    executionStatus: availabilityStatus === 'available' && Boolean(bestFeeQuote?.fee) ? 'executable' : 'non_executable',
    unavailableReason,
    warning: availabilityStatus === 'available'
      ? 'Executes through Synthra V3 swap router and requires token approval.'
      : undefined,
  }
}
