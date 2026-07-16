import { afterEach, describe, expect, it, vi } from 'vitest'
import { createIndexerHandler, createSupabaseIndexerStore, type IndexerDependencies, type IndexerStore } from './indexer.js'

const CURSOR = 44_170_199n

function response() {
  return {
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this },
    json(body: unknown) { this.body = body; return this },
  }
}

function store(overrides: Partial<IndexerStore> = {}): IndexerStore {
  return {
    acquireLock: vi.fn().mockResolvedValue(true),
    releaseLock: vi.fn().mockResolvedValue(undefined),
    getCursor: vi.fn().mockResolvedValue(CURSOR),
    persistChunk: vi.fn().mockResolvedValue(0),
    ...overrides,
  }
}

function dependencies(indexerStore = store(), overrides: Partial<IndexerDependencies> = {}): IndexerDependencies {
  return {
    getStore: () => indexerStore,
    getBlockNumber: vi.fn().mockResolvedValue(CURSOR + 6n),
    fetchRows: vi.fn().mockResolvedValue({ rows: [] }),
    runStableIndexer: vi.fn().mockResolvedValue({ status: 'success' }),
    randomUUID: () => '00000000-0000-0000-0000-000000000001',
    now: () => 1_000,
    log: vi.fn(),
    ...overrides,
  }
}

async function invoke(deps: IndexerDependencies, authorization = 'Bearer secret') {
  process.env.CRON_SECRET = 'secret'
  const res = response()
  await createIndexerHandler(deps)({ headers: { authorization } } as never, res as never)
  return res
}

afterEach(() => {
  for (const name of ['CRON_SECRET', 'INDEXER_BATCH_SIZE', 'INDEXER_MAX_BLOCKS_PER_RUN', 'INDEXER_CONFIRMATION_BLOCKS']) delete process.env[name]
})

describe('cron indexer reliability', () => {
  it('rejects unauthorized requests even with a Vercel cron user agent', async () => {
    process.env.CRON_SECRET = 'secret'
    const res = response()
    await createIndexerHandler(dependencies())({ headers: { authorization: 'Bearer wrong', 'user-agent': 'vercel-cron/1.0' } } as never, res as never)
    expect(res.statusCode).toBe(401)
    expect(res.body).toEqual({ error: 'Unauthorized' })
  })

  it('fails closed when CRON_SECRET is missing', async () => {
    const res = response()
    await createIndexerHandler(dependencies())({ headers: { authorization: 'Bearer undefined' } } as never, res as never)
    expect(res.statusCode).toBe(503)
    expect(res.body).toEqual({ error: 'Indexer is not configured' })
  })

  it('does not write when there are no confirmed new blocks', async () => {
    process.env.INDEXER_CONFIRMATION_BLOCKS = '5'
    const indexerStore = store()
    const res = await invoke(dependencies(indexerStore, { getBlockNumber: vi.fn().mockResolvedValue(CURSOR + 5n) }))
    expect(indexerStore.persistChunk).not.toHaveBeenCalled()
    expect(res.body).toMatchObject({ status: 'up_to_date', safeHead: Number(CURSOR), lagBlocks: 5 })
  })

  it('caps backlog processing and chunks the capped range', async () => {
    process.env.INDEXER_BATCH_SIZE = '3'
    process.env.INDEXER_MAX_BLOCKS_PER_RUN = '5'
    process.env.INDEXER_CONFIRMATION_BLOCKS = '0'
    const fetchRows = vi.fn().mockResolvedValue({ rows: [] })
    const res = await invoke(dependencies(store(), { getBlockNumber: vi.fn().mockResolvedValue(CURSOR + 21n), fetchRows }))
    expect(fetchRows.mock.calls.map((call) => call.slice(0, 2))).toEqual([[CURSOR + 1n, CURSOR + 3n], [CURSOR + 4n, CURSOR + 5n]])
    expect(res.body).toMatchObject({ fromBlock: Number(CURSOR + 1n), toBlock: Number(CURSOR + 5n), safeHead: Number(CURSOR + 21n), lagBlocks: 16 })
  })

  it('checkpoints the cursor after every successful chunk', async () => {
    process.env.INDEXER_BATCH_SIZE = '2'
    process.env.INDEXER_MAX_BLOCKS_PER_RUN = '4'
    process.env.INDEXER_CONFIRMATION_BLOCKS = '0'
    const indexerStore = store()
    await invoke(dependencies(indexerStore, { getBlockNumber: vi.fn().mockResolvedValue(CURSOR + 4n) }))
    expect(indexerStore.persistChunk).toHaveBeenNthCalledWith(1, '00000000-0000-0000-0000-000000000001', [], CURSOR + 2n, undefined)
    expect(indexerStore.persistChunk).toHaveBeenNthCalledWith(2, '00000000-0000-0000-0000-000000000001', [], CURSOR + 4n, undefined)
  })

  it('does not advance the cursor when RPC retries are exhausted', async () => {
    process.env.INDEXER_CONFIRMATION_BLOCKS = '0'
    const persistChunk = vi.fn()
    const fetchRows = vi.fn().mockRejectedValue(new Error('RPC eth_getLogs failed after 3 attempts (rate_limit)'))

    const res = await invoke(dependencies(store({ persistChunk }), { fetchRows }))

    expect(res.statusCode).toBe(500)
    expect(persistChunk).not.toHaveBeenCalled()
  })

  it('does not attempt a later checkpoint when event persistence fails', async () => {
    process.env.INDEXER_BATCH_SIZE = '2'
    process.env.INDEXER_MAX_BLOCKS_PER_RUN = '4'
    process.env.INDEXER_CONFIRMATION_BLOCKS = '0'
    const persistChunk = vi.fn().mockRejectedValue(new Error('database write failed'))
    const res = await invoke(dependencies(store({ persistChunk }), { getBlockNumber: vi.fn().mockResolvedValue(CURSOR + 4n) }))
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Indexer failed' })
    expect(persistChunk).toHaveBeenCalledTimes(1)
  })

  it('returns and logs a sanitized failure when RPC details contain credentials', async () => {
    const log = vi.fn()
    const secret = 'https://eth-mainnet.g.alchemy.com/v2/super-secret-key'
    const res = await invoke(dependencies(store({
      acquireLock: vi.fn().mockRejectedValue(new Error(`RPC failed at ${secret} Authorization: Bearer hidden-token`)),
    }), { log }))

    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Indexer failed' })
    const serialized = JSON.stringify(log.mock.calls)
    expect(serialized).not.toContain('super-secret-key')
    expect(serialized).not.toContain('hidden-token')
    expect(serialized).not.toContain('Authorization')
  })

  it('skips an overlapping invocation without touching the cursor', async () => {
    const indexerStore = store({ acquireLock: vi.fn().mockResolvedValue(false) })
    const res = await invoke(dependencies(indexerStore))
    expect(res.statusCode).toBe(200)
    expect(res.body).toEqual({ status: 'skipped_overlap' })
    expect(indexerStore.getCursor).not.toHaveBeenCalled()
  })

  it('isolates a stable indexer failure from a successful classic run', async () => {
    process.env.INDEXER_CONFIRMATION_BLOCKS = '0'
    const res = await invoke(dependencies(store(), { runStableIndexer: vi.fn().mockRejectedValue(new Error('stable failed')) }))
    expect(res.statusCode).toBe(200)
    expect(res.body).toMatchObject({ status: 'success', stablePool: { status: 'failed' } })
    expect(JSON.stringify(res.body)).not.toContain('stable failed')
  })
})

describe('Supabase-backed store', () => {
  it('surfaces an acquire-lock RPC error', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: 'rpc failure' } })
    await expect(createSupabaseIndexerStore({ rpc } as never).acquireLock('token')).rejects.toThrow('Supabase acquire lock failed')
  })

  it('passes the lock token when atomically persisting a chunk', async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 0, error: null })
    await createSupabaseIndexerStore({ rpc } as never).persistChunk('owner-token', [], CURSOR)
    expect(rpc).toHaveBeenCalledWith('persist_indexer_chunk', expect.objectContaining({ p_lock_token: 'owner-token' }))
  })
})
