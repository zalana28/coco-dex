/**
 * Backfill script for Coco DEX analytics indexer.
 *
 * Usage:
 *   npx tsx scripts/backfillAnalytics.ts
 *
 * Requires: ARC_TESTNET_RPC_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Optional: BACKFILL_FROM_BLOCK (default 44170190), BACKFILL_TO_BLOCK, BACKFILL_CHUNK_SIZE (default 5000)
 *
 * Fetches block timestamps from RPC and stores them on every row.
 * Also backfills null timestamps on previously indexed rows.
 * Safe to rerun — uses upsert with unique(tx_hash, log_index).
 */

import { createClient } from '@supabase/supabase-js'
import { createPublicClient, http, defineChain, parseAbiItem } from 'viem'
import type { PublicClient } from 'viem'

const RPC_URL = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network'
const SUPABASE_URL = process.env.SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const PAIR_ADDRESS = '0x0eEA9DC9153215B15b1E6c43f4D68779002d4F1c' as const
const USDC_ADDRESS = '0x3600000000000000000000000000000000000000'
const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const USDC_IS_TOKEN0 = USDC_ADDRESS.toLowerCase() < EURC_ADDRESS.toLowerCase()
const FEE_RATE = 0.003

const BACKFILL_FROM_BLOCK = BigInt(process.env.BACKFILL_FROM_BLOCK || '44170190')
const BACKFILL_TO_BLOCK = process.env.BACKFILL_TO_BLOCK ? BigInt(process.env.BACKFILL_TO_BLOCK) : null
const BATCH_SIZE = BigInt(process.env.BACKFILL_CHUNK_SIZE || '5000')

if (!SUPABASE_URL || !SUPABASE_KEY) { console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'); process.exit(1) }

const arcTestnet = defineChain({ id: 5042002, name: 'Arc Testnet', nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 }, rpcUrls: { default: { http: [RPC_URL] } }, testnet: true })
const client: PublicClient = createPublicClient({ chain: arcTestnet, transport: http(RPC_URL) })
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } })

const SWAP_EVENT = parseAbiItem('event Swap(address indexed sender, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out, address indexed to)')
const MINT_EVENT = parseAbiItem('event Mint(address indexed sender, uint256 amount0, uint256 amount1)')
const BURN_EVENT = parseAbiItem('event Burn(address indexed sender, uint256 amount0, uint256 amount1, address indexed to)')
const SYNC_EVENT = parseAbiItem('event Sync(uint112 reserve0, uint112 reserve1)')

const tsCache = new Map<bigint, string>()
async function getBlockTimestamp(blockNumber: bigint): Promise<string> {
  const cached = tsCache.get(blockNumber)
  if (cached) return cached
  const block = await client.getBlock({ blockNumber })
  const ts = new Date(Number(block.timestamp) * 1000).toISOString()
  tsCache.set(blockNumber, ts)
  return ts
}

function computeSwapVolumeUsd(a0In: bigint, a1In: bigint, a0Out: bigint, a1Out: bigint): number {
  const usdcVol = Number((USDC_IS_TOKEN0 ? a0In : a1In) + (USDC_IS_TOKEN0 ? a0Out : a1Out)) / 1e6
  const eurcVol = (Number((USDC_IS_TOKEN0 ? a1In : a0In) + (USDC_IS_TOKEN0 ? a1Out : a0Out)) / 1e6) * 1.08
  return Math.max(usdcVol, eurcVol)
}

async function main() {
  console.log(`Starting backfill (from=${BACKFILL_FROM_BLOCK}, batch=${BATCH_SIZE})...`)

  const { data: state } = await supabase.from('indexer_state').select('last_indexed_block').eq('id', 'arc_testnet').single()
  const lastIndexedBlock = BigInt(state?.last_indexed_block ?? 0)
  let fromBlock = lastIndexedBlock + 1n > BACKFILL_FROM_BLOCK ? lastIndexedBlock + 1n : BACKFILL_FROM_BLOCK
  const currentBlock = BACKFILL_TO_BLOCK ?? await client.getBlockNumber()

  console.log(`  Effective start: ${fromBlock}, target: ${currentBlock}`)
  if (fromBlock > currentBlock) { console.log('Already up to date.'); } else {
    let totalInserted = 0
    let latestReserve0: bigint | null = null, latestReserve1: bigint | null = null

    while (fromBlock <= currentBlock) {
      const toBlock = fromBlock + BATCH_SIZE - 1n > currentBlock ? currentBlock : fromBlock + BATCH_SIZE - 1n
      console.log(`  Blocks ${fromBlock}-${toBlock}...`)

      const [swapLogs, mintLogs, burnLogs, syncLogs] = await Promise.all([
        client.getLogs({ address: PAIR_ADDRESS, event: SWAP_EVENT, fromBlock, toBlock }),
        client.getLogs({ address: PAIR_ADDRESS, event: MINT_EVENT, fromBlock, toBlock }),
        client.getLogs({ address: PAIR_ADDRESS, event: BURN_EVENT, fromBlock, toBlock }),
        client.getLogs({ address: PAIR_ADDRESS, event: SYNC_EVENT, fromBlock, toBlock }),
      ])

      const allLogs = [...swapLogs, ...mintLogs, ...burnLogs, ...syncLogs]
      for (const bn of new Set(allLogs.map((l) => l.blockNumber!))) { await getBlockTimestamp(bn) }

      const rows: Array<Record<string, unknown>> = []

      for (const log of swapLogs) {
        const a = log.args; if (!a) continue
        const vol = computeSwapVolumeUsd(a.amount0In ?? 0n, a.amount1In ?? 0n, a.amount0Out ?? 0n, a.amount1Out ?? 0n)
        rows.push({ tx_hash: log.transactionHash, log_index: log.logIndex, block_number: Number(log.blockNumber), block_timestamp: tsCache.get(log.blockNumber!) ?? null, event_type: 'swap', wallet: a.to, amount0_in: String(a.amount0In ?? 0n), amount1_in: String(a.amount1In ?? 0n), amount0_out: String(a.amount0Out ?? 0n), amount1_out: String(a.amount1Out ?? 0n), volume_usd: vol, fee_usd: vol * FEE_RATE })
      }
      for (const log of mintLogs) {
        const a = log.args as { sender?: string; amount0?: bigint; amount1?: bigint } | undefined; if (!a) continue
        const uV = USDC_IS_TOKEN0 ? Number(a.amount0 ?? 0n) / 1e6 : Number(a.amount1 ?? 0n) / 1e6
        const eV = USDC_IS_TOKEN0 ? Number(a.amount1 ?? 0n) / 1e6 : Number(a.amount0 ?? 0n) / 1e6
        rows.push({ tx_hash: log.transactionHash, log_index: log.logIndex, block_number: Number(log.blockNumber), block_timestamp: tsCache.get(log.blockNumber!) ?? null, event_type: 'mint', wallet: a.sender, amount0_in: String(a.amount0 ?? 0n), amount1_in: String(a.amount1 ?? 0n), amount0_out: '0', amount1_out: '0', volume_usd: uV + eV * 1.08, fee_usd: 0 })
      }
      for (const log of burnLogs) {
        const a = log.args as { sender?: string; amount0?: bigint; amount1?: bigint; to?: string } | undefined; if (!a) continue
        const uV = USDC_IS_TOKEN0 ? Number(a.amount0 ?? 0n) / 1e6 : Number(a.amount1 ?? 0n) / 1e6
        const eV = USDC_IS_TOKEN0 ? Number(a.amount1 ?? 0n) / 1e6 : Number(a.amount0 ?? 0n) / 1e6
        rows.push({ tx_hash: log.transactionHash, log_index: log.logIndex, block_number: Number(log.blockNumber), block_timestamp: tsCache.get(log.blockNumber!) ?? null, event_type: 'burn', wallet: a.to, amount0_in: '0', amount1_in: '0', amount0_out: String(a.amount0 ?? 0n), amount1_out: String(a.amount1 ?? 0n), volume_usd: uV + eV * 1.08, fee_usd: 0 })
      }
      for (const log of syncLogs) {
        const a = log.args as { reserve0?: bigint; reserve1?: bigint } | undefined; if (!a) continue
        latestReserve0 = a.reserve0 ?? 0n; latestReserve1 = a.reserve1 ?? 0n
        rows.push({ tx_hash: log.transactionHash, log_index: log.logIndex, block_number: Number(log.blockNumber), block_timestamp: tsCache.get(log.blockNumber!) ?? null, event_type: 'sync', wallet: null, amount0_in: '0', amount1_in: '0', amount0_out: '0', amount1_out: '0', reserve0: String(latestReserve0), reserve1: String(latestReserve1), volume_usd: 0, fee_usd: 0 })
      }

      if (rows.length > 0) {
        const { error } = await supabase.from('dex_events').upsert(rows, { onConflict: 'tx_hash,log_index', ignoreDuplicates: true })
        if (error) console.error('  Insert error:', error.message); else totalInserted += rows.length
      }
      await supabase.from('indexer_state').update({ last_indexed_block: Number(toBlock), updated_at: new Date().toISOString() }).eq('id', 'arc_testnet')
      fromBlock = toBlock + 1n
    }

    if (latestReserve0 !== null && latestReserve1 !== null) {
      const rU = USDC_IS_TOKEN0 ? latestReserve0 : latestReserve1, rE = USDC_IS_TOKEN0 ? latestReserve1 : latestReserve0
      await supabase.from('pool_snapshots').insert({ pool_address: PAIR_ADDRESS.toLowerCase(), block_number: Number(currentBlock), reserve_usdc: String(rU), reserve_eurc: String(rE), tvl_usd: Number(rU) / 1e6 + (Number(rE) / 1e6) * 1.08 })
    }
    console.log(`Backfill complete. Inserted ${totalInserted} events.`)
  }

  // ─── Backfill null timestamps ───
  console.log('\nBackfilling null timestamps...')
  let updated = 0
  while (true) {
    const { data: nullRows } = await supabase.from('dex_events').select('block_number').is('block_timestamp', null).limit(100)
    if (!nullRows || nullRows.length === 0) break
    for (const bn of [...new Set(nullRows.map((r) => r.block_number as number))]) {
      const ts = await getBlockTimestamp(BigInt(bn))
      const { count } = await supabase.from('dex_events').update({ block_timestamp: ts }).eq('block_number', bn).is('block_timestamp', null)
      updated += count ?? 0
    }
    console.log(`  Updated ${updated} rows...`)
  }
  console.log(`Timestamp backfill done. ${updated} rows updated.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
