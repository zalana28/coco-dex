import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { PublicClient } from 'viem'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { getArcClient, PAIR_ADDRESS, USDC_IS_TOKEN0 } from '../_lib/arcClient.js'
import { fetchPairLogs, computeSwapVolumeUsd, computeTvlUsd } from '../_lib/dexEvents.js'
import type { DexEventRow } from '../_lib/dexEvents.js'
import { runStablePoolIndexer } from '../_lib/stablePoolIndexer.js'

const BATCH_SIZE = 2000n
const FEE_RATE = 0.003 // 0.3%
/** Coco DEX deployment block — never index before this */
const DEPLOYMENT_BLOCK = 44170190n

/**
 * Fetch block timestamp from RPC with in-memory cache for the run.
 */
async function getBlockTimestamp(
  client: PublicClient,
  blockNumber: bigint,
  cache: Map<bigint, string>
): Promise<string> {
  const cached = cache.get(blockNumber)
  if (cached) return cached
  const block = await client.getBlock({ blockNumber })
  const ts = new Date(Number(block.timestamp) * 1000).toISOString()
  cache.set(blockNumber, ts)
  return ts
}

/**
 * Vercel Cron handler: indexes new Pair events from Arc Testnet.
 * Protected by CRON_SECRET or Vercel cron user-agent.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // ─── Auth: validate cron request ───
  const authHeader = req.headers.authorization
  const cronSecret = process.env.CRON_SECRET
  const userAgent = req.headers['user-agent'] || ''

  const isVercelCron = userAgent.includes('vercel-cron')
  const hasValidSecret = cronSecret && authHeader === `Bearer ${cronSecret}`

  if (!isVercelCron && !hasValidSecret) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const startTime = Date.now()
    const supabase = getSupabaseAdmin()
    const client = getArcClient()

    // Get last indexed block
    const { data: state } = await supabase
      .from('indexer_state')
      .select('last_indexed_block')
      .eq('id', 'arc_testnet')
      .single()

    const lastBlock = BigInt(state?.last_indexed_block ?? 0)
    const currentBlock = await client.getBlockNumber()

    // Clamp: never start before deployment block
    const effectiveLastBlock = lastBlock < DEPLOYMENT_BLOCK ? DEPLOYMENT_BLOCK - 1n : lastBlock

    if (currentBlock <= effectiveLastBlock) {
      return res.status(200).json({ message: 'Already up to date', lastBlock: Number(effectiveLastBlock) })
    }

    // Process in chunks
    let fromBlock = effectiveLastBlock + 1n
    const toBlockMax = currentBlock
    let totalInserted = 0
    let timestampedBlocks = 0
    let stablePoolRun: Awaited<ReturnType<typeof runStablePoolIndexer>> | { status: 'failed'; error: string } | null = null
    let latestReserve0: bigint | null = null
    let latestReserve1: bigint | null = null

    // Block timestamp cache for this run
    const tsCache = new Map<bigint, string>()

    while (fromBlock <= toBlockMax) {
      const toBlock = fromBlock + BATCH_SIZE - 1n > toBlockMax ? toBlockMax : fromBlock + BATCH_SIZE - 1n

      const { swapLogs, mintLogs, burnLogs, syncLogs } = await fetchPairLogs(client, fromBlock, toBlock)

      const rows: DexEventRow[] = []

      // Collect all unique block numbers for timestamp fetching
      const allLogs = [...swapLogs, ...mintLogs, ...burnLogs, ...syncLogs]
      const uniqueBlocks = new Set(allLogs.map((l) => l.blockNumber!))
      for (const bn of uniqueBlocks) {
        if (!tsCache.has(bn)) {
          await getBlockTimestamp(client, bn, tsCache)
          timestampedBlocks++
        }
      }

      // Process Swap events
      for (const log of swapLogs) {
        const args = log.args
        if (!args) continue
        const volume = computeSwapVolumeUsd(
          args.amount0In ?? 0n, args.amount1In ?? 0n,
          args.amount0Out ?? 0n, args.amount1Out ?? 0n
        )
        rows.push({
          tx_hash: log.transactionHash!,
          log_index: log.logIndex!,
          block_number: Number(log.blockNumber),
          block_timestamp: tsCache.get(log.blockNumber!) ?? null,
          event_type: 'swap',
          wallet: (args.to as string) ?? null,
          amount0_in: String(args.amount0In ?? 0n),
          amount1_in: String(args.amount1In ?? 0n),
          amount0_out: String(args.amount0Out ?? 0n),
          amount1_out: String(args.amount1Out ?? 0n),
          reserve0: null, reserve1: null,
          volume_usd: volume,
          fee_usd: volume * FEE_RATE,
        })
      }

      // Process Mint events
      for (const log of mintLogs) {
        const args = log.args
        if (!args) continue
        const amount0 = (args as { amount0?: bigint }).amount0 ?? 0n
        const amount1 = (args as { amount1?: bigint }).amount1 ?? 0n
        const volumeUsdc = USDC_IS_TOKEN0 ? Number(amount0) / 1e6 : Number(amount1) / 1e6
        const volumeEurc = USDC_IS_TOKEN0 ? Number(amount1) / 1e6 : Number(amount0) / 1e6
        rows.push({
          tx_hash: log.transactionHash!,
          log_index: log.logIndex!,
          block_number: Number(log.blockNumber),
          block_timestamp: tsCache.get(log.blockNumber!) ?? null,
          event_type: 'mint',
          wallet: (args as { sender?: string }).sender ?? null,
          amount0_in: String(amount0), amount1_in: String(amount1),
          amount0_out: '0', amount1_out: '0',
          reserve0: null, reserve1: null,
          volume_usd: volumeUsdc + volumeEurc * 1.08,
          fee_usd: 0,
        })
      }

      // Process Burn events
      for (const log of burnLogs) {
        const args = log.args
        if (!args) continue
        const amount0 = (args as { amount0?: bigint }).amount0 ?? 0n
        const amount1 = (args as { amount1?: bigint }).amount1 ?? 0n
        const volumeUsdc = USDC_IS_TOKEN0 ? Number(amount0) / 1e6 : Number(amount1) / 1e6
        const volumeEurc = USDC_IS_TOKEN0 ? Number(amount1) / 1e6 : Number(amount0) / 1e6
        rows.push({
          tx_hash: log.transactionHash!,
          log_index: log.logIndex!,
          block_number: Number(log.blockNumber),
          block_timestamp: tsCache.get(log.blockNumber!) ?? null,
          event_type: 'burn',
          wallet: (args as { to?: string }).to ?? null,
          amount0_in: '0', amount1_in: '0',
          amount0_out: String(amount0), amount1_out: String(amount1),
          reserve0: null, reserve1: null,
          volume_usd: volumeUsdc + volumeEurc * 1.08,
          fee_usd: 0,
        })
      }

      // Process Sync events
      for (const log of syncLogs) {
        const args = log.args
        if (!args) continue
        const reserve0 = (args as { reserve0?: bigint }).reserve0 ?? 0n
        const reserve1 = (args as { reserve1?: bigint }).reserve1 ?? 0n
        latestReserve0 = reserve0
        latestReserve1 = reserve1
        rows.push({
          tx_hash: log.transactionHash!,
          log_index: log.logIndex!,
          block_number: Number(log.blockNumber),
          block_timestamp: tsCache.get(log.blockNumber!) ?? null,
          event_type: 'sync',
          wallet: null,
          amount0_in: '0', amount1_in: '0',
          amount0_out: '0', amount1_out: '0',
          reserve0: String(reserve0), reserve1: String(reserve1),
          volume_usd: 0, fee_usd: 0,
        })
      }

      // Insert events idempotently
      if (rows.length > 0) {
        const { error } = await supabase
          .from('dex_events')
          .upsert(rows, { onConflict: 'tx_hash,log_index', ignoreDuplicates: true })
        if (error) console.error('Insert error:', error)
        else totalInserted += rows.length
      }

      fromBlock = toBlock + 1n
    }

    // ─── Backfill null timestamps for previously indexed rows ───
    let updatedTimestamps = 0
    const { data: nullTsBlocks } = await supabase
      .from('dex_events')
      .select('block_number')
      .is('block_timestamp', null)
      .limit(50)

    if (nullTsBlocks && nullTsBlocks.length > 0) {
      const distinctBlocks = [...new Set(nullTsBlocks.map((r) => r.block_number))]
      for (const bn of distinctBlocks) {
        const ts = await getBlockTimestamp(client, BigInt(bn), tsCache)
        const { count } = await supabase
          .from('dex_events')
          .update({ block_timestamp: ts })
          .eq('block_number', bn)
          .is('block_timestamp', null)
        updatedTimestamps += count ?? 0
      }
    }

    // Update pool snapshot if we have reserves
    if (latestReserve0 !== null && latestReserve1 !== null) {
      const reserveUsdc = USDC_IS_TOKEN0 ? latestReserve0 : latestReserve1
      const reserveEurc = USDC_IS_TOKEN0 ? latestReserve1 : latestReserve0
      const tvl = computeTvlUsd(reserveUsdc, reserveEurc)
      await supabase.from('pool_snapshots').insert({
        pool_address: PAIR_ADDRESS.toLowerCase(),
        block_number: Number(toBlockMax),
        reserve_usdc: String(reserveUsdc),
        reserve_eurc: String(reserveEurc),
        tvl_usd: tvl,
        snapshot_at: new Date().toISOString(),
      })
    }

    // Update indexer state
    await supabase
      .from('indexer_state')
      .update({ last_indexed_block: Number(toBlockMax), updated_at: new Date().toISOString() })
      .eq('id', 'arc_testnet')

    try {
      stablePoolRun = await runStablePoolIndexer({ supabase, client })
    } catch (stablePoolError) {
      console.error('Stable pool indexer error:', stablePoolError)
      stablePoolRun = {
        status: 'failed',
        error: stablePoolError instanceof Error ? stablePoolError.message : String(stablePoolError),
      }
    }

    return res.status(200).json({
      message: 'Indexer run complete',
      fromBlock: Number(effectiveLastBlock + 1n),
      toBlock: Number(toBlockMax),
      insertedEvents: totalInserted,
      updatedEvents: updatedTimestamps,
      timestampedBlocks,
      stablePool: stablePoolRun,
      latestIndexedBlock: Number(toBlockMax),
      lagBlocks: 0,
      durationMs: Date.now() - startTime,
    })
  } catch (error: unknown) {
    console.error('Indexer error:', error)
    return res.status(500).json({ error: 'Indexer failed', details: String(error) })
  }
}
