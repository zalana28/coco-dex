import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublicClient } from 'viem'
import { arcTestnet, COCO_STABLE_LP_TOKEN_ADDRESS, COCO_STABLE_POOL_ADDRESS } from './arcClient.js'
import {
  fetchStablePoolLogs,
  mapStablePoolLogsToRows,
  readStablePoolSnapshot,
  STABLE_POOL_DEPLOYMENT_BLOCK,
} from './stablePoolEvents.js'

const STABLE_POOL_BATCH_SIZE = 2000n

async function getBlockTimestamp(client: PublicClient, blockNumber: bigint, cache: Map<bigint, string>) {
  const cached = cache.get(blockNumber)
  if (cached) return cached
  const block = await client.getBlock({ blockNumber })
  const timestamp = new Date(Number(block.timestamp) * 1000).toISOString()
  cache.set(blockNumber, timestamp)
  return timestamp
}

async function getLastStablePoolBlock(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('stable_pool_indexer_runs')
    .select('to_block')
    .eq('pool_address', COCO_STABLE_POOL_ADDRESS.toLowerCase())
    .eq('chain_id', arcTestnet.id)
    .eq('status', 'success')
    .order('to_block', { ascending: false })
    .limit(1)
    .maybeSingle()

  return BigInt(data?.to_block ?? 0)
}

export async function runStablePoolIndexer({
  supabase,
  client,
}: {
  supabase: SupabaseClient
  client: PublicClient
}) {
  const startedAt = new Date().toISOString()
  let eventsIndexed = 0
  let snapshotsWritten = 0
  let fromBlock: bigint | null = null
  let toBlockMax: bigint | null = null

  const { data: runInsert } = await supabase
    .from('stable_pool_indexer_runs')
    .insert({
      chain_id: arcTestnet.id,
      pool_address: COCO_STABLE_POOL_ADDRESS.toLowerCase(),
      started_at: startedAt,
      status: 'started',
    })
    .select('id')
    .single()
  const runId = runInsert?.id

  try {
    const lastBlock = await getLastStablePoolBlock(supabase)
    const currentBlock = await client.getBlockNumber()
    const effectiveLastBlock = lastBlock < STABLE_POOL_DEPLOYMENT_BLOCK ? STABLE_POOL_DEPLOYMENT_BLOCK - 1n : lastBlock
    let nextFromBlock = effectiveLastBlock + 1n
    const finalToBlock = currentBlock
    fromBlock = nextFromBlock
    toBlockMax = finalToBlock

    const tsCache = new Map<bigint, string>()

    while (nextFromBlock <= finalToBlock) {
      const toBlock =
        nextFromBlock + STABLE_POOL_BATCH_SIZE - 1n > finalToBlock
          ? finalToBlock
          : nextFromBlock + STABLE_POOL_BATCH_SIZE - 1n
      const logs = await fetchStablePoolLogs(client, nextFromBlock, toBlock)
      const allLogs = [
        ...logs.liquidityAddedLogs,
        ...logs.liquidityRemovedLogs,
        ...logs.swapLogs,
        ...logs.feeUpdatedLogs,
        ...logs.pausedLogs,
        ...logs.unpausedLogs,
      ]

      for (const log of allLogs) {
        if (log.blockNumber) await getBlockTimestamp(client, log.blockNumber, tsCache)
      }

      // V1 has enough events for coarse observability, but no Sync event. Snapshots
      // are the source of truth for current reserves and LP supply.
      const snapshot = await readStablePoolSnapshot(client, toBlock)
      const rows = mapStablePoolLogsToRows({ logs, blockTimestamps: tsCache, snapshot })

      if (rows.length > 0) {
        const { error } = await supabase
          .from('stable_pool_events')
          .upsert(rows, { onConflict: 'tx_hash,log_index', ignoreDuplicates: true })
        if (error) throw error
        eventsIndexed += rows.length
      }

      await supabase.from('stable_pool_reserve_snapshots').insert({
        pool_address: snapshot.pool_address,
        chain_id: snapshot.chain_id,
        snapshot_type: 'reserve',
        block_number: snapshot.block_number,
        block_timestamp: snapshot.block_timestamp,
        token0_address: snapshot.token0_address,
        token1_address: snapshot.token1_address,
        reserve0_raw: snapshot.reserve0_raw,
        reserve1_raw: snapshot.reserve1_raw,
        lp_total_supply_raw: snapshot.lp_total_supply_raw,
        lp_decimals: snapshot.lp_decimals,
      })
      snapshotsWritten++

      await supabase.from('stable_pool_lp_snapshots').insert({
        pool_address: snapshot.pool_address,
        chain_id: snapshot.chain_id,
        snapshot_type: 'lp_supply',
        block_number: snapshot.block_number,
        block_timestamp: snapshot.block_timestamp,
        lp_token_address: COCO_STABLE_LP_TOKEN_ADDRESS.toLowerCase(),
        lp_total_supply_raw: snapshot.lp_total_supply_raw,
        lp_decimals: snapshot.lp_decimals,
      })
      snapshotsWritten++

      nextFromBlock = toBlock + 1n
      fromBlock = nextFromBlock
    }

    const finishedAt = new Date().toISOString()
    if (runId !== undefined) {
      await supabase
        .from('stable_pool_indexer_runs')
        .update({
          finished_at: finishedAt,
          status: 'success',
          from_block: Number(effectiveLastBlock + 1n),
          to_block: Number(finalToBlock),
          events_indexed: eventsIndexed,
          snapshots_written: snapshotsWritten,
        })
        .eq('id', runId)
    }

    return {
      status: 'success' as const,
      fromBlock: Number(effectiveLastBlock + 1n),
      toBlock: Number(finalToBlock),
      eventsIndexed,
      snapshotsWritten,
    }
  } catch (error) {
    if (runId !== undefined) {
      await supabase
        .from('stable_pool_indexer_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'failed',
          from_block: fromBlock === null ? null : Number(fromBlock),
          to_block: toBlockMax === null ? null : Number(toBlockMax),
          events_indexed: eventsIndexed,
          snapshots_written: snapshotsWritten,
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq('id', runId)
    }
    throw error
  }
}
