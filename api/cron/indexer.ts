import type { VercelRequest, VercelResponse } from '@vercel/node'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PublicClient } from 'viem'
import { getSupabaseAdmin } from '../_lib/supabaseAdmin.js'
import { getArcClient, PAIR_ADDRESS, USDC_IS_TOKEN0 } from '../_lib/arcClient.js'
import { fetchPairLogs, computeSwapVolumeUsd, computeTvlUsd } from '../_lib/dexEvents.js'
import type { DexEventRow } from '../_lib/dexEvents.js'
import { runStablePoolIndexer } from '../_lib/stablePoolIndexer.js'

const FEE_RATE = 0.003
const DEPLOYMENT_BLOCK = 44170190n
const INDEXER_STATE_ID = 'arc_testnet'
const LOCK_NAME = 'arc_testnet_indexer'

type PoolSnapshot = {
  pool_address: string
  block_number: number
  reserve_usdc: string
  reserve_eurc: string
  tvl_usd: number
  snapshot_at: string
}

export interface IndexerStore {
  acquireLock(token: string): Promise<boolean>
  releaseLock(token: string): Promise<void>
  getCursor(): Promise<bigint>
  persistChunk(token: string, rows: DexEventRow[], toBlock: bigint, snapshot?: PoolSnapshot): Promise<number | undefined>
}

export interface IndexerDependencies {
  getStore(): IndexerStore
  getBlockNumber(): Promise<bigint>
  fetchRows(fromBlock: bigint, toBlock: bigint): Promise<{ rows: DexEventRow[]; snapshot?: PoolSnapshot }>
  runStableIndexer(): Promise<unknown>
  randomUUID(): string
  now(): number
  log(entry: Record<string, unknown>): void
}

function requiredPositiveInteger(name: string, fallback: number, allowZero = false): bigint {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return BigInt(fallback)
  const parsed = Number(raw)
  const valid = Number.isSafeInteger(parsed) && (allowZero ? parsed >= 0 : parsed > 0)
  if (!valid) throw new Error(`Invalid ${name}`)
  return BigInt(parsed)
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function createSupabaseIndexerStore(supabase: SupabaseClient): IndexerStore {
  return {
    async acquireLock(token) {
      const { data, error } = await supabase.rpc('acquire_indexer_lock', {
        p_lock_name: LOCK_NAME,
        p_lock_token: token,
        p_ttl_seconds: 600,
      })
      if (error) throw new Error('Supabase acquire lock failed', { cause: error })
      if (typeof data !== 'boolean') throw new Error('Supabase acquire lock returned invalid data')
      return data
    },
    async releaseLock(token) {
      const { error } = await supabase.rpc('release_indexer_lock', {
        p_lock_name: LOCK_NAME,
        p_lock_token: token,
      })
      if (error) throw new Error('Supabase release lock failed', { cause: error })
    },
    async getCursor() {
      const { data, error } = await supabase
        .from('indexer_state')
        .select('last_indexed_block')
        .eq('id', INDEXER_STATE_ID)
        .single()
      if (error) throw new Error('Supabase cursor read failed', { cause: error })
      if (data?.last_indexed_block === undefined || data.last_indexed_block === null) {
        throw new Error('Supabase cursor row is missing')
      }
      return BigInt(data.last_indexed_block)
    },
    async persistChunk(token, rows, toBlock, snapshot) {
      const { data, error } = await supabase.rpc('persist_indexer_chunk', {
        p_lock_name: LOCK_NAME,
        p_lock_token: token,
        p_state_id: INDEXER_STATE_ID,
        p_events: rows,
        p_last_indexed_block: Number(toBlock),
        p_snapshot: snapshot ?? null,
      })
      if (error) throw new Error('Supabase chunk persistence failed', { cause: error })
      if (typeof data !== 'number') throw new Error('Supabase chunk persistence returned invalid data')
      return data
    },
  }
}

async function getBlockTimestamp(client: PublicClient, blockNumber: bigint, cache: Map<bigint, string>) {
  const cached = cache.get(blockNumber)
  if (cached) return cached
  const block = await client.getBlock({ blockNumber })
  const timestamp = new Date(Number(block.timestamp) * 1000).toISOString()
  cache.set(blockNumber, timestamp)
  return timestamp
}

async function fetchClassicRows(client: PublicClient, fromBlock: bigint, toBlock: bigint) {
  const { swapLogs, mintLogs, burnLogs, syncLogs } = await fetchPairLogs(client, fromBlock, toBlock)
  const rows: DexEventRow[] = []
  const cache = new Map<bigint, string>()
  const allLogs = [...swapLogs, ...mintLogs, ...burnLogs, ...syncLogs]
  for (const blockNumber of new Set(allLogs.map((log) => log.blockNumber!).filter(Boolean))) {
    await getBlockTimestamp(client, blockNumber, cache)
  }

  for (const log of swapLogs) {
    if (!log.args || !log.transactionHash || log.logIndex === null || log.logIndex === undefined || !log.blockNumber) continue
    const volume = computeSwapVolumeUsd(log.args.amount0In ?? 0n, log.args.amount1In ?? 0n, log.args.amount0Out ?? 0n, log.args.amount1Out ?? 0n)
    rows.push({ tx_hash: log.transactionHash, log_index: log.logIndex, block_number: Number(log.blockNumber), block_timestamp: cache.get(log.blockNumber) ?? null, event_type: 'swap', wallet: (log.args.to as string) ?? null, amount0_in: String(log.args.amount0In ?? 0n), amount1_in: String(log.args.amount1In ?? 0n), amount0_out: String(log.args.amount0Out ?? 0n), amount1_out: String(log.args.amount1Out ?? 0n), reserve0: null, reserve1: null, volume_usd: volume, fee_usd: volume * FEE_RATE })
  }
  for (const log of mintLogs) {
    if (!log.args || !log.transactionHash || log.logIndex === null || log.logIndex === undefined || !log.blockNumber) continue
    const args = log.args as { amount0?: bigint; amount1?: bigint; sender?: string }
    const amount0 = args.amount0 ?? 0n; const amount1 = args.amount1 ?? 0n
    const usdc = Number(USDC_IS_TOKEN0 ? amount0 : amount1) / 1e6; const eurc = Number(USDC_IS_TOKEN0 ? amount1 : amount0) / 1e6
    rows.push({ tx_hash: log.transactionHash, log_index: log.logIndex, block_number: Number(log.blockNumber), block_timestamp: cache.get(log.blockNumber) ?? null, event_type: 'mint', wallet: args.sender ?? null, amount0_in: String(amount0), amount1_in: String(amount1), amount0_out: '0', amount1_out: '0', reserve0: null, reserve1: null, volume_usd: usdc + eurc * 1.08, fee_usd: 0 })
  }
  for (const log of burnLogs) {
    if (!log.args || !log.transactionHash || log.logIndex === null || log.logIndex === undefined || !log.blockNumber) continue
    const args = log.args as { amount0?: bigint; amount1?: bigint; to?: string }
    const amount0 = args.amount0 ?? 0n; const amount1 = args.amount1 ?? 0n
    const usdc = Number(USDC_IS_TOKEN0 ? amount0 : amount1) / 1e6; const eurc = Number(USDC_IS_TOKEN0 ? amount1 : amount0) / 1e6
    rows.push({ tx_hash: log.transactionHash, log_index: log.logIndex, block_number: Number(log.blockNumber), block_timestamp: cache.get(log.blockNumber) ?? null, event_type: 'burn', wallet: args.to ?? null, amount0_in: '0', amount1_in: '0', amount0_out: String(amount0), amount1_out: String(amount1), reserve0: null, reserve1: null, volume_usd: usdc + eurc * 1.08, fee_usd: 0 })
  }
  let latestSync: DexEventRow | undefined
  for (const log of syncLogs) {
    if (!log.args || !log.transactionHash || log.logIndex === null || log.logIndex === undefined || !log.blockNumber) continue
    const args = log.args as { reserve0?: bigint; reserve1?: bigint }
    const reserve0 = args.reserve0 ?? 0n; const reserve1 = args.reserve1 ?? 0n
    latestSync = { tx_hash: log.transactionHash, log_index: log.logIndex, block_number: Number(log.blockNumber), block_timestamp: cache.get(log.blockNumber) ?? null, event_type: 'sync', wallet: null, amount0_in: '0', amount1_in: '0', amount0_out: '0', amount1_out: '0', reserve0: String(reserve0), reserve1: String(reserve1), volume_usd: 0, fee_usd: 0 }
    rows.push(latestSync)
  }
  let snapshot: PoolSnapshot | undefined
  if (latestSync?.reserve0 !== null && latestSync?.reserve0 !== undefined && latestSync.reserve1 !== null && latestSync.reserve1 !== undefined) {
    const reserve0 = BigInt(latestSync.reserve0); const reserve1 = BigInt(latestSync.reserve1)
    const reserveUsdc = USDC_IS_TOKEN0 ? reserve0 : reserve1; const reserveEurc = USDC_IS_TOKEN0 ? reserve1 : reserve0
    snapshot = { pool_address: PAIR_ADDRESS.toLowerCase(), block_number: latestSync.block_number, reserve_usdc: String(reserveUsdc), reserve_eurc: String(reserveEurc), tvl_usd: computeTvlUsd(reserveUsdc, reserveEurc), snapshot_at: latestSync.block_timestamp ?? new Date().toISOString() }
  }
  return { rows, snapshot }
}

export function createIndexerHandler(deps: IndexerDependencies) {
  return async function handler(req: VercelRequest, res: VercelResponse) {
    const cronSecret = process.env.CRON_SECRET
    if (!cronSecret) return res.status(503).json({ error: 'Indexer is not configured' })
    if (req.headers.authorization !== `Bearer ${cronSecret}`) return res.status(401).json({ error: 'Unauthorized' })

    const started = deps.now()
    const token = deps.randomUUID()
    let store: IndexerStore | undefined
    let locked = false
    try {
      const batchSize = requiredPositiveInteger('INDEXER_BATCH_SIZE', 500)
      const maxBlocks = requiredPositiveInteger('INDEXER_MAX_BLOCKS_PER_RUN', 2000)
      const confirmations = requiredPositiveInteger('INDEXER_CONFIRMATION_BLOCKS', 12, true)
      store = deps.getStore()
      locked = await store.acquireLock(token)
      if (!locked) return res.status(200).json({ status: 'skipped_overlap' })

      const cursor = await store.getCursor()
      const chainHead = await deps.getBlockNumber()
      const safeHead = chainHead > confirmations ? chainHead - confirmations : 0n
      const effectiveCursor = cursor < DEPLOYMENT_BLOCK ? DEPLOYMENT_BLOCK - 1n : cursor
      const firstBlock = effectiveCursor + 1n
      let lastProcessed = effectiveCursor
      let insertedEvents = 0

      if (firstBlock <= safeHead) {
        const runHead = firstBlock + maxBlocks - 1n < safeHead ? firstBlock + maxBlocks - 1n : safeHead
        for (let fromBlock = firstBlock; fromBlock <= runHead;) {
          const toBlock = fromBlock + batchSize - 1n < runHead ? fromBlock + batchSize - 1n : runHead
          const chunkStarted = deps.now()
          const { rows, snapshot } = await deps.fetchRows(fromBlock, toBlock)
          const inserted = await store.persistChunk(token, rows, toBlock, snapshot)
          insertedEvents += inserted ?? 0
          lastProcessed = toBlock
          deps.log({ event: 'indexer_chunk_committed', fromBlock: Number(fromBlock), toBlock: Number(toBlock), safeHead: Number(safeHead), lagBlocks: Number(safeHead - toBlock), insertedEvents: inserted ?? 0, durationMs: deps.now() - chunkStarted })
          fromBlock = toBlock + 1n
        }
      }

      let stablePool: unknown
      try {
        stablePool = await deps.runStableIndexer()
      } catch (error) {
        deps.log({ event: 'stable_indexer_failed', error: errorMessage(error) })
        stablePool = { status: 'failed' }
      }

      const lagBlocks = chainHead > lastProcessed ? chainHead - lastProcessed : 0n
      const result = { status: firstBlock > safeHead ? 'up_to_date' : 'success', fromBlock: Number(firstBlock), toBlock: Number(lastProcessed), safeHead: Number(safeHead), lagBlocks: Number(lagBlocks), insertedEvents, durationMs: deps.now() - started, stablePool }
      deps.log({ event: 'indexer_run_complete', ...result })
      return res.status(200).json(result)
    } catch (error) {
      deps.log({ event: 'indexer_run_failed', durationMs: deps.now() - started, error: errorMessage(error) })
      return res.status(500).json({ error: 'Indexer failed' })
    } finally {
      if (locked && store) {
        try { await store.releaseLock(token) } catch (error) { deps.log({ event: 'indexer_lock_release_failed', error: errorMessage(error) }) }
      }
    }
  }
}

function productionDependencies(): IndexerDependencies {
  let supabase: SupabaseClient | undefined
  let client: PublicClient | undefined
  const getSupabase = () => (supabase ??= getSupabaseAdmin())
  const getClient = () => (client ??= getArcClient())
  return {
    getStore: () => createSupabaseIndexerStore(getSupabase()),
    getBlockNumber: () => getClient().getBlockNumber(),
    fetchRows: (fromBlock, toBlock) => fetchClassicRows(getClient(), fromBlock, toBlock),
    runStableIndexer: () => runStablePoolIndexer({ supabase: getSupabase(), client: getClient() }),
    randomUUID: () => crypto.randomUUID(),
    now: () => Date.now(),
    log: (entry) => console.log(JSON.stringify(entry)),
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  return createIndexerHandler(productionDependencies())(req, res)
}
