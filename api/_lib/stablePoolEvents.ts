import { type PublicClient, parseAbiItem } from 'viem'
import {
  arcTestnet,
  COCO_STABLE_LP_TOKEN_ADDRESS,
  COCO_STABLE_POOL_ADDRESS,
  EURC_ADDRESS,
  USDC_ADDRESS,
} from './arcClient.js'

export const STABLE_POOL_DEPLOYMENT_BLOCK = 45646084n

export const STABLE_POOL_EVENTS = {
  liquidityAdded: parseAbiItem('event LiquidityAdded(address indexed provider, address indexed to, uint256 amount0, uint256 amount1, uint256 lpMinted)'),
  liquidityRemoved: parseAbiItem('event LiquidityRemoved(address indexed provider, address indexed to, uint256 lpBurned, uint256 amount0, uint256 amount1)'),
  swap: parseAbiItem('event Swap(address indexed sender, address indexed to, address indexed tokenIn, address tokenOut, uint256 amountIn, uint256 amountOut, uint256 feeAmount)'),
  feeUpdated: parseAbiItem('event FeeUpdated(uint256 oldFeeBps, uint256 newFeeBps)'),
  paused: parseAbiItem('event Paused(address account)'),
  unpaused: parseAbiItem('event Unpaused(address account)'),
} as const

export const STABLE_POOL_READ_ABI = [
  {
    type: 'function',
    name: 'getBalances',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'balance0', type: 'uint256' },
      { name: 'balance1', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'getTokens',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'address' },
      { name: '', type: 'address' },
    ],
  },
] as const

export const STABLE_LP_READ_ABI = [
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const

export type StablePoolEventRow = {
  pool_address: string
  chain_id: number
  event_type: 'liquidity_added' | 'liquidity_removed' | 'swap' | 'fee_updated' | 'paused' | 'unpaused'
  tx_hash: string
  block_number: number
  log_index: number
  block_timestamp: string | null
  token0_address: string
  token1_address: string
  reserve0_raw: string | null
  reserve1_raw: string | null
  lp_total_supply_raw: string | null
  lp_decimals: number | null
  provider?: string | null
  recipient?: string | null
  token_in?: string | null
  token_out?: string | null
  amount0_raw?: string | null
  amount1_raw?: string | null
  lp_amount_raw?: string | null
  amount_in_raw?: string | null
  amount_out_raw?: string | null
  fee_amount_raw?: string | null
}

export type StablePoolSnapshot = {
  pool_address: string
  chain_id: number
  block_number: number
  block_timestamp: string | null
  token0_address: string
  token1_address: string
  reserve0_raw: string
  reserve1_raw: string
  lp_total_supply_raw: string
  lp_decimals: number
}

export async function fetchStablePoolLogs(client: PublicClient, fromBlock: bigint, toBlock: bigint) {
  const address = COCO_STABLE_POOL_ADDRESS
  const [liquidityAddedLogs, liquidityRemovedLogs, swapLogs, feeUpdatedLogs, pausedLogs, unpausedLogs] = await Promise.all([
    client.getLogs({ address, event: STABLE_POOL_EVENTS.liquidityAdded, fromBlock, toBlock }),
    client.getLogs({ address, event: STABLE_POOL_EVENTS.liquidityRemoved, fromBlock, toBlock }),
    client.getLogs({ address, event: STABLE_POOL_EVENTS.swap, fromBlock, toBlock }),
    client.getLogs({ address, event: STABLE_POOL_EVENTS.feeUpdated, fromBlock, toBlock }),
    client.getLogs({ address, event: STABLE_POOL_EVENTS.paused, fromBlock, toBlock }),
    client.getLogs({ address, event: STABLE_POOL_EVENTS.unpaused, fromBlock, toBlock }),
  ])

  return { liquidityAddedLogs, liquidityRemovedLogs, swapLogs, feeUpdatedLogs, pausedLogs, unpausedLogs }
}

export function mapStablePoolLogsToRows({
  logs,
  blockTimestamps,
  snapshot,
}: {
  logs: Awaited<ReturnType<typeof fetchStablePoolLogs>>
  blockTimestamps: Map<bigint, string>
  snapshot?: StablePoolSnapshot
}): StablePoolEventRow[] {
  const base = {
    pool_address: COCO_STABLE_POOL_ADDRESS.toLowerCase(),
    chain_id: arcTestnet.id,
    token0_address: (snapshot?.token0_address ?? USDC_ADDRESS).toLowerCase(),
    token1_address: (snapshot?.token1_address ?? EURC_ADDRESS).toLowerCase(),
    reserve0_raw: snapshot?.reserve0_raw ?? null,
    reserve1_raw: snapshot?.reserve1_raw ?? null,
    lp_total_supply_raw: snapshot?.lp_total_supply_raw ?? null,
    lp_decimals: snapshot?.lp_decimals ?? null,
  }

  const rows: StablePoolEventRow[] = []

  for (const log of logs.liquidityAddedLogs) {
    const args = log.args
    rows.push({
      ...base,
      event_type: 'liquidity_added',
      tx_hash: log.transactionHash!,
      block_number: Number(log.blockNumber),
      log_index: log.logIndex!,
      block_timestamp: blockTimestamps.get(log.blockNumber!) ?? null,
      provider: args.provider?.toLowerCase() ?? null,
      recipient: args.to?.toLowerCase() ?? null,
      amount0_raw: String(args.amount0 ?? 0n),
      amount1_raw: String(args.amount1 ?? 0n),
      lp_amount_raw: String(args.lpMinted ?? 0n),
    })
  }

  for (const log of logs.liquidityRemovedLogs) {
    const args = log.args
    rows.push({
      ...base,
      event_type: 'liquidity_removed',
      tx_hash: log.transactionHash!,
      block_number: Number(log.blockNumber),
      log_index: log.logIndex!,
      block_timestamp: blockTimestamps.get(log.blockNumber!) ?? null,
      provider: args.provider?.toLowerCase() ?? null,
      recipient: args.to?.toLowerCase() ?? null,
      amount0_raw: String(args.amount0 ?? 0n),
      amount1_raw: String(args.amount1 ?? 0n),
      lp_amount_raw: String(args.lpBurned ?? 0n),
    })
  }

  for (const log of logs.swapLogs) {
    const args = log.args
    rows.push({
      ...base,
      event_type: 'swap',
      tx_hash: log.transactionHash!,
      block_number: Number(log.blockNumber),
      log_index: log.logIndex!,
      block_timestamp: blockTimestamps.get(log.blockNumber!) ?? null,
      provider: args.sender?.toLowerCase() ?? null,
      recipient: args.to?.toLowerCase() ?? null,
      token_in: args.tokenIn?.toLowerCase() ?? null,
      token_out: args.tokenOut?.toLowerCase() ?? null,
      amount_in_raw: String(args.amountIn ?? 0n),
      amount_out_raw: String(args.amountOut ?? 0n),
      fee_amount_raw: String(args.feeAmount ?? 0n),
    })
  }

  for (const log of logs.feeUpdatedLogs) {
    rows.push({
      ...base,
      event_type: 'fee_updated',
      tx_hash: log.transactionHash!,
      block_number: Number(log.blockNumber),
      log_index: log.logIndex!,
      block_timestamp: blockTimestamps.get(log.blockNumber!) ?? null,
    })
  }

  for (const log of logs.pausedLogs) {
    rows.push({
      ...base,
      event_type: 'paused',
      tx_hash: log.transactionHash!,
      block_number: Number(log.blockNumber),
      log_index: log.logIndex!,
      block_timestamp: blockTimestamps.get(log.blockNumber!) ?? null,
    })
  }

  for (const log of logs.unpausedLogs) {
    rows.push({
      ...base,
      event_type: 'unpaused',
      tx_hash: log.transactionHash!,
      block_number: Number(log.blockNumber),
      log_index: log.logIndex!,
      block_timestamp: blockTimestamps.get(log.blockNumber!) ?? null,
    })
  }

  return rows
}

export async function readStablePoolSnapshot(client: PublicClient, blockNumber?: bigint): Promise<StablePoolSnapshot> {
  const block = blockNumber
    ? await client.getBlock({ blockNumber })
    : await client.getBlock({ blockTag: 'latest' })
  const targetBlockNumber = block.number ?? await client.getBlockNumber()

  const [tokens, balances, totalSupply, lpDecimals] = await Promise.all([
    client.readContract({
      address: COCO_STABLE_POOL_ADDRESS,
      abi: STABLE_POOL_READ_ABI,
      functionName: 'getTokens',
      blockNumber: targetBlockNumber,
    }),
    client.readContract({
      address: COCO_STABLE_POOL_ADDRESS,
      abi: STABLE_POOL_READ_ABI,
      functionName: 'getBalances',
      blockNumber: targetBlockNumber,
    }),
    client.readContract({
      address: COCO_STABLE_LP_TOKEN_ADDRESS,
      abi: STABLE_LP_READ_ABI,
      functionName: 'totalSupply',
      blockNumber: targetBlockNumber,
    }),
    client.readContract({
      address: COCO_STABLE_LP_TOKEN_ADDRESS,
      abi: STABLE_LP_READ_ABI,
      functionName: 'decimals',
      blockNumber: targetBlockNumber,
    }),
  ])

  return {
    pool_address: COCO_STABLE_POOL_ADDRESS.toLowerCase(),
    chain_id: arcTestnet.id,
    block_number: Number(targetBlockNumber),
    block_timestamp: new Date(Number(block.timestamp) * 1000).toISOString(),
    token0_address: tokens[0].toLowerCase(),
    token1_address: tokens[1].toLowerCase(),
    reserve0_raw: String(balances[0]),
    reserve1_raw: String(balances[1]),
    lp_total_supply_raw: String(totalSupply),
    lp_decimals: Number(lpDecimals),
  }
}
