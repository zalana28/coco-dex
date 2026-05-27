/**
 * Backfill script for Coco DEX analytics indexer.
 *
 * Usage:
 *   npx tsx scripts/backfillAnalytics.ts
 *
 * Requires environment variables:
 *   ARC_TESTNET_RPC_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *
 * Optional environment variables:
 *   BACKFILL_FROM_BLOCK  — default: 44170190 (Coco DEX deployment block)
 *   BACKFILL_TO_BLOCK    — default: latest block from RPC
 *   BACKFILL_CHUNK_SIZE  — default: 5000
 *
 * The effective start block is:
 *   max(BACKFILL_FROM_BLOCK, last_indexed_block + 1)
 *
 * Safe to rerun — uses upsert with unique(tx_hash, log_index).
 *
 * If a previous backfill started from too early blocks, either:
 *   - Rerun with BACKFILL_FROM_BLOCK=44170190 (it will clamp automatically), or
 *   - Reset the indexer_state row in Supabase before rerunning.
 */

import { createClient } from '@supabase/supabase-js'
import { createPublicClient, http, defineChain, parseAbiItem } from 'viem'

// ─── Config ───
const RPC_URL = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network'
const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const PAIR_ADDRESS = '0x0eEA9DC9153215B15b1E6c43f4D68779002d4F1c' as const
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'
const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const USDC_IS_TOKEN0 = USDC_ADDRESS.toLowerCase() < EURC_ADDRESS.toLowerCase()
const FEE_RATE = 0.003

/** Coco DEX deployment block on Arc Testnet */
const DEFAULT_DEPLOYMENT_BLOCK = 44170190n

const BACKFILL_FROM_BLOCK = BigInt(process.env.BACKFILL_FROM_BLOCK || '44170190')
const BACKFILL_TO_BLOCK = process.env.BACKFILL_TO_BLOCK ? BigInt(process.env.BACKFILL_TO_BLOCK) : null
const BATCH_SIZE = BigInt(process.env.BACKFILL_CHUNK_SIZE || '5000')

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [RPC_URL] } },
  testnet: true,
})

const client = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) })
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const SWAP_EVENT = parseAbiItem('event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)')
const MINT_EVENT = parseAbiItem('event Mint(address indexed sender, uint256 amount0, uint256 amount1)')
const BURN_EVENT = parseAbiItem('event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)')
const SYNC_EVENT = parseAbiItem('event Sync(uint112 reserve0, uint112 reserve1)')

function computeSwapVolumeUsd(a0In: bigint, a1In: bigint, a0Out: bigint, a1Out: bigint): number {
  const usdcIn = USDC_IS_TOKEN0 ? a0In : a1In
  const eurcIn = USDC_IS_TOKEN0 ? a1In : a0In
  const usdcOut = USDC_IS_TOKEN0 ? a0Out : a1Out
  const eurcOut = USDC_IS_TOKEN0 ? a1Out : a0Out
  const usdcVol = Number(usdcIn + usdcOut) / 1e6
  const eurcVol = (Number(eurcIn + eurcOut) / 1e6) * 1.08
  return Math.max(usdcVol, eurcVol)
}

async function main() {
  console.log('Starting backfill...')
  console.log(`  BACKFILL_FROM_BLOCK: ${BACKFILL_FROM_BLOCK}`)
  console.log(`  BACKFILL_TO_BLOCK: ${BACKFILL_TO_BLOCK ?? 'latest'}`)
  console.log(`  BATCH_SIZE: ${BATCH_SIZE}`)

  // Get last indexed block from DB
  const { data: state } = await supabase
    .from('indexer_state')
    .select('last_indexed_block')
    .eq('id', 'arc_testnet')
    .single()

  const lastIndexedBlock = BigInt(state?.last_indexed_block ?? 0)

  // Effective start = max(BACKFILL_FROM_BLOCK, last_indexed_block + 1)
  // This ensures we never scan blocks before deployment, even if indexer_state
  // was previously written with a low value.
  const fromDbOrConfig = lastIndexedBlock + 1n > BACKFILL_FROM_BLOCK
    ? lastIndexedBlock + 1n
    : BACKFILL_FROM_BLOCK

  let fromBlock = fromDbOrConfig

  const currentBlock = BACKFILL_TO_BLOCK ?? await client.getBlockNumber()

  console.log(`  DB last_indexed_block: ${lastIndexedBlock}`)
  console.log(`  Effective start block: ${fromBlock}`)
  console.log(`  Target end block: ${currentBlock}`)

  if (fromBlock > currentBlock) {
    console.log('Already up to date. Nothing to backfill.')
    return
  }

  let totalInserted = 0
  let latestReserve0: bigint | null = null
  let latestReserve1: bigint | null = null

  while (fromBlock <= currentBlock) {
    const toBlock = fromBlock + BATCH_SIZE - 1n > currentBlock ? currentBlock : fromBlock + BATCH_SIZE - 1n
    console.log(`  Processing blocks ${fromBlock} - ${toBlock}...`)

    const [swapLogs, mintLogs, burnLogs, syncLogs] = await Promise.all([
      client.getLogs({ address: PAIR_ADDRESS, event: SWAP_EVENT, fromBlock, toBlock }),
      client.getLogs({ address: PAIR_ADDRESS, event: MINT_EVENT, fromBlock, toBlock }),
      client.getLogs({ address: PAIR_ADDRESS, event: BURN_EVENT, fromBlock, toBlock }),
      client.getLogs({ address: PAIR_ADDRESS, event: SYNC_EVENT, fromBlock, toBlock }),
    ])

    const rows: Array<Record<string, unknown>> = []

    for (const log of swapLogs) {
      const a = log.args
      if (!a) continue
      const vol = computeSwapVolumeUsd(a.amount0In ?? 0n, a.amount1In ?? 0n, a.amount0Out ?? 0n, a.amount1Out ?? 0n)
      rows.push({
        tx_hash: log.transactionHash, log_index: log.logIndex, block_number: Number(log.blockNumber),
        event_type: 'swap', wallet: a.to, amount0_in: String(a.amount0In ?? 0n), amount1_in: String(a.amount1In ?? 0n),
        amount0_out: String(a.amount0Out ?? 0n), amount1_out: String(a.amount1Out ?? 0n),
        volume_usd: vol, fee_usd: vol * FEE_RATE,
      })
    }

    for (const log of mintLogs) {
      const a = log.args as { sender?: string; amount0?: bigint; amount1?: bigint } | undefined
      if (!a) continue
      const uVol = USDC_IS_TOKEN0 ? Number(a.amount0 ?? 0n) / 1e6 : Number(a.amount1 ?? 0n) / 1e6
      const eVol = USDC_IS_TOKEN0 ? Number(a.amount1 ?? 0n) / 1e6 : Number(a.amount0 ?? 0n) / 1e6
      rows.push({
        tx_hash: log.transactionHash, log_index: log.logIndex, block_number: Number(log.blockNumber),
        event_type: 'mint', wallet: a.sender, amount0_in: String(a.amount0 ?? 0n), amount1_in: String(a.amount1 ?? 0n),
        amount0_out: '0', amount1_out: '0', volume_usd: uVol + eVol * 1.08, fee_usd: 0,
      })
    }

    for (const log of burnLogs) {
      const a = log.args as { sender?: string; amount0?: bigint; amount1?: bigint; to?: string } | undefined
      if (!a) continue
      const uVol = USDC_IS_TOKEN0 ? Number(a.amount0 ?? 0n) / 1e6 : Number(a.amount1 ?? 0n) / 1e6
      const eVol = USDC_IS_TOKEN0 ? Number(a.amount1 ?? 0n) / 1e6 : Number(a.amount0 ?? 0n) / 1e6
      rows.push({
        tx_hash: log.transactionHash, log_index: log.logIndex, block_number: Number(log.blockNumber),
        event_type: 'burn', wallet: a.to, amount0_in: '0', amount1_in: '0',
        amount0_out: String(a.amount0 ?? 0n), amount1_out: String(a.amount1 ?? 0n),
        volume_usd: uVol + eVol * 1.08, fee_usd: 0,
      })
    }

    for (const log of syncLogs) {
      const a = log.args as { reserve0?: bigint; reserve1?: bigint } | undefined
      if (!a) continue
      latestReserve0 = a.reserve0 ?? 0n
      latestReserve1 = a.reserve1 ?? 0n
      rows.push({
        tx_hash: log.transactionHash, log_index: log.logIndex, block_number: Number(log.blockNumber),
        event_type: 'sync', wallet: null, amount0_in: '0', amount1_in: '0', amount0_out: '0', amount1_out: '0',
        reserve0: String(latestReserve0), reserve1: String(latestReserve1), volume_usd: 0, fee_usd: 0,
      })
    }

    if (rows.length > 0) {
      const { error } = await supabase.from('dex_events').upsert(rows, { onConflict: 'tx_hash,log_index', ignoreDuplicates: true })
      if (error) console.error('  Insert error:', error.message)
      else totalInserted += rows.length
    }

    // Update state as we go
    await supabase.from('indexer_state').update({ last_indexed_block: Number(toBlock), updated_at: new Date().toISOString() }).eq('id', 'arc_testnet')
    fromBlock = toBlock + 1n
  }

  // Final snapshot
  if (latestReserve0 !== null && latestReserve1 !== null) {
    const rUsdc = USDC_IS_TOKEN0 ? latestReserve0 : latestReserve1
    const rEurc = USDC_IS_TOKEN0 ? latestReserve1 : latestReserve0
    const tvl = Number(rUsdc) / 1e6 + (Number(rEurc) / 1e6) * 1.08
    await supabase.from('pool_snapshots').insert({
      pool_address: PAIR_ADDRESS.toLowerCase(), block_number: Number(currentBlock),
      reserve_usdc: String(rUsdc), reserve_eurc: String(rEurc), tvl_usd: tvl,
    })
  }

  console.log(`Backfill complete. Inserted ${totalInserted} events.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
