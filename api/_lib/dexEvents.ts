import { type PublicClient, parseAbiItem, type Log } from 'viem'
import { PAIR_ADDRESS, USDC_IS_TOKEN0 } from './arcClient'

/**
 * Uniswap V2 Pair event signatures (standard).
 */
export const SWAP_EVENT = parseAbiItem(
  'event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)'
)
export const MINT_EVENT = parseAbiItem(
  'event Mint(address indexed sender, uint256 amount0, uint256 amount1)'
)
export const BURN_EVENT = parseAbiItem(
  'event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)'
)
export const SYNC_EVENT = parseAbiItem(
  'event Sync(uint112 reserve0, uint112 reserve1)'
)

/** Fetch all relevant pair events in a block range */
export async function fetchPairLogs(
  client: PublicClient,
  fromBlock: bigint,
  toBlock: bigint
) {
  const [swapLogs, mintLogs, burnLogs, syncLogs] = await Promise.all([
    client.getLogs({ address: PAIR_ADDRESS, event: SWAP_EVENT, fromBlock, toBlock }),
    client.getLogs({ address: PAIR_ADDRESS, event: MINT_EVENT, fromBlock, toBlock }),
    client.getLogs({ address: PAIR_ADDRESS, event: BURN_EVENT, fromBlock, toBlock }),
    client.getLogs({ address: PAIR_ADDRESS, event: SYNC_EVENT, fromBlock, toBlock }),
  ])

  return { swapLogs, mintLogs, burnLogs, syncLogs }
}

/** Both USDC and EURC use 6 decimals */
const DECIMALS = 6
const DIVISOR = 10 ** DECIMALS

/**
 * Compute USD volume from a swap event.
 * USDC ≈ $1, EURC ≈ $1.08 (approximate).
 * We use the input side as volume (either USDC in or EURC in converted).
 */
export function computeSwapVolumeUsd(
  amount0In: bigint,
  amount1In: bigint,
  amount0Out: bigint,
  amount1Out: bigint
): number {
  // token0 = USDC, token1 = EURC (if USDC_IS_TOKEN0)
  const usdcIn = USDC_IS_TOKEN0 ? amount0In : amount1In
  const eurcIn = USDC_IS_TOKEN0 ? amount1In : amount0In
  const usdcOut = USDC_IS_TOKEN0 ? amount0Out : amount1Out
  const eurcOut = USDC_IS_TOKEN0 ? amount1Out : amount0Out

  // Volume = max of input side or output side in USD terms
  const usdcVolume = Number(usdcIn + usdcOut) / DIVISOR
  const eurcVolume = (Number(eurcIn + eurcOut) / DIVISOR) * 1.08

  // Use the larger for more accuracy
  return Math.max(usdcVolume, eurcVolume)
}

/**
 * Compute TVL from reserves.
 * TVL = reserve_usdc * $1 + reserve_eurc * ~$1.08
 */
export function computeTvlUsd(reserveUsdc: bigint, reserveEurc: bigint): number {
  return (Number(reserveUsdc) / DIVISOR) + (Number(reserveEurc) / DIVISOR) * 1.08
}

/** Decode swap log args */
export interface SwapArgs {
  sender: string
  amount0In: bigint
  amount1In: bigint
  amount0Out: bigint
  amount1Out: bigint
  to: string
}

/** Decode mint log args */
export interface MintArgs {
  sender: string
  amount0: bigint
  amount1: bigint
}

/** Decode burn log args */
export interface BurnArgs {
  sender: string
  amount0: bigint
  amount1: bigint
  to: string
}

/** Decode sync log args */
export interface SyncArgs {
  reserve0: bigint
  reserve1: bigint
}

export type DexEventRow = {
  tx_hash: string
  log_index: number
  block_number: number
  block_timestamp: string | null
  event_type: 'swap' | 'mint' | 'burn' | 'sync'
  wallet: string | null
  amount0_in: string
  amount1_in: string
  amount0_out: string
  amount1_out: string
  reserve0: string | null
  reserve1: string | null
  volume_usd: number
  fee_usd: number
}
