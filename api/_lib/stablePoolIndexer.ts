import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublicClient } from 'viem'
import { arcTestnet, COCO_STABLE_LP_TOKEN_ADDRESS, COCO_STABLE_POOL_ADDRESS } from './arcClient.js'
import {
  fetchStablePoolLogs,
  mapStablePoolLogsToRows,
  readStablePoolSnapshot,
  STABLE_POOL_DEPLOYMENT_BLOCK,
} from './stablePoolEvents.js'

function configValue(name: string, fallback: number, allowZero = false) {
  const value = Number(process.env[name] ?? fallback)
  if (!Number.isSafeInteger(value) || (allowZero ? value < 0 : value <= 0)) throw new Error(`Invalid ${name}`)
  return BigInt(value)
}

async function getBlockTimestamp(client: PublicClient, blockNumber: bigint, cache: Map<bigint, string>) {
  const cached = cache.get(blockNumber)
  if (cached) return cached
  const block = await client.getBlock({ blockNumber })
  const timestamp = new Date(Number(block.timestamp) * 1000).toISOString()
  cache.set(blockNumber, timestamp)
  return timestamp
}

async function getLastStablePoolBlock(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from('stable_pool_indexer_runs')
    .select('to_block')
    .eq('pool_address', COCO_STABLE_POOL_ADDRESS.toLowerCase())
    .eq('chain_id', arcTestnet.id)
    .eq('status', 'success')
    .order('to_block', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error('Supabase stable cursor read failed', { cause: error })
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
  // fix(1): use runStartBlock captured once before loop — never overwritten mid-run
  let runStartBlock: bigint | null = null
  let toBlockMax: bigint | null = null

  const { data: runInsert, error: runInsertError } = await supabase
    .from('stable_pool_indexer_runs')
    .insert({
      chain_id: arcTestnet.id,
      pool_address: COCO_STABLE_POOL_ADDRESS.toLowerCase(),
      started_at: startedAt,
      status: 'started',
    })
    .select('id')
    .single()
  if (runInsertError) throw new Error('Supabase stable run insert failed', { cause: runInsertError })
  const runId = runInsert?.id

  try {
    const lastBlock = await getLastStablePoolBlock(supabase)
    const currentBlock = await client.getBlockNumber()
    const confirmations = configValue('INDEXER_CONFIRMATION_BLOCKS', 12, true)
    const safeHead = currentBlock > confirmations ? currentBlock - confirmations : 0n
    const batchSize = configValue('INDEXER_BATCH_SIZE', 500)
    const maxBlocks = configValue('INDEXER_MAX_BLOCKS_PER_RUN', 2000)
    const effectiveLastBlock = lastBlock < STABLE_POOL_DEPLOYMENT_BLOCK ? STABLE_POOL_DEPLOYMENT_BLOCK - 1n : lastBlock
    let nextFromBlock = effectiveLastBlock + 1n
    const finalToBlock = nextFromBlock + maxBlocks - 1n < safeHead ? nextFromBlock + maxBlocks - 1n : safeHead
    runStartBlock = nextFromBlock
    toBlockMax = finalToBlock

    const tsCache = new Map<bigint, string>()

    while (nextFromBlock <= finalToBlock) {
      const toBlock =
        nextFromBlock + batchSize - 1n > finalToBlock
          ? finalToBlock
          : nextFromBlock + batchSize - 1n
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

      // fix(2): check errors on reserve snapshot insert
      const { error: reserveSnapshotError } = await supabase.from('stable_pool_reserve_snapshots').upsert({
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
      }, { onConflict: 'pool_address,chain_id,block_number', ignoreDuplicates: true })
      if (reserveSnapshotError) throw reserveSnapshotError
      snapshotsWritten++

      // fix(2): check errors on lp snapshot insert
      const { error: lpSnapshotError } = await supabase.from('stable_pool_lp_snapshots').upsert({
        pool_address: snapshot.pool_address,
        chain_id: snapshot.chain_id,
        snapshot_type: 'lp_supply',
        block_number: snapshot.block_number,
        block_timestamp: snapshot.block_timestamp,
        lp_token_address: COCO_STABLE_LP_TOKEN_ADDRESS.toLowerCase(),
        lp_total_supply_raw: snapshot.lp_total_supply_raw,
        lp_decimals: snapshot.lp_decimals,
      }, { onConflict: 'pool_address,chain_id,block_number', ignoreDuplicates: true })
      if (lpSnapshotError) throw lpSnapshotError
      snapshotsWritten++

      nextFromBlock = toBlock + 1n
      // fix(1): removed `fromBlock = nextFromBlock` — runStartBlock is never overwritten
    }

    const finishedAt = new Date().toISOString()
    if (runId !== undefined) {
      const { error: runUpdateError } = await supabase
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
      if (runUpdateError) throw new Error('Supabase stable run update failed', { cause: runUpdateError })
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
      const { error: failedRunUpdateError } = await supabase
        .from('stable_pool_indexer_runs')
        .update({
          finished_at: new Date().toISOString(),
          status: 'failed',
          // fix(1): always points to the actual run start, not next batch
          from_block: runStartBlock === null ? null : Number(runStartBlock),
          to_block: toBlockMax === null ? null : Number(toBlockMax),
          events_indexed: eventsIndexed,
          snapshots_written: snapshotsWritten,
          error_message: error instanceof Error ? error.message : String(error),
        })
        .eq('id', runId)
      if (failedRunUpdateError) console.error(JSON.stringify({ event: 'stable_run_failure_record_failed' }))
    }
    throw error
  }
}
