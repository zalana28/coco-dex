import { createPublicClient, custom, encodeAbiParameters, encodeEventTopics, parseAbiParameters } from 'viem'
import { describe, expect, it, vi } from 'vitest'
import { BURN_EVENT, fetchPairLogs, MINT_EVENT, SWAP_EVENT, SYNC_EVENT } from './dexEvents.js'
import { fetchLogsResilient } from './rpcLogs.js'

const baseLog = {
  address: '0x0eEA9DC9153215B15b1E6c43f4D68779002d4F1c',
  blockHash: '0xblock',
  blockNumber: 10n,
  data: '0x',
  logIndex: 0,
  removed: false,
  topics: [],
  transactionHash: '0xtx',
  transactionIndex: 0,
}

const classicLogs = [
  { ...baseLog, eventName: 'Swap', args: { sender: '0x1', amount0In: 1n, amount1In: 2n, amount0Out: 3n, amount1Out: 4n, to: '0x2' } },
  { ...baseLog, logIndex: 1, eventName: 'Mint', args: { sender: '0x1', amount0: 5n, amount1: 6n } },
  { ...baseLog, logIndex: 2, eventName: 'Burn', args: { sender: '0x1', amount0: 7n, amount1: 8n, to: '0x2' } },
  { ...baseLog, logIndex: 3, eventName: 'Sync', args: { reserve0: 9n, reserve1: 10n } },
]

describe('classic event log fetching', () => {
  it('decodes a combined provider response through a real Viem client', async () => {
    const sender = '0x1111111111111111111111111111111111111111'
    const recipient = '0x2222222222222222222222222222222222222222'
    const transactionHash = `0x${'a'.repeat(64)}` as const
    const blockHash = `0x${'b'.repeat(64)}` as const
    const rawLogs = [
      {
        event: SWAP_EVENT,
        args: { sender, to: recipient },
        data: encodeAbiParameters(parseAbiParameters('uint256, uint256, uint256, uint256'), [1n, 2n, 3n, 4n]),
      },
      {
        event: MINT_EVENT,
        args: { sender },
        data: encodeAbiParameters(parseAbiParameters('uint256, uint256'), [5n, 6n]),
      },
      {
        event: BURN_EVENT,
        args: { sender, to: recipient },
        data: encodeAbiParameters(parseAbiParameters('uint256, uint256'), [7n, 8n]),
      },
      {
        event: SYNC_EVENT,
        args: {},
        data: encodeAbiParameters(parseAbiParameters('uint112, uint112'), [9n, 10n]),
      },
    ].map(({ event, args, data }, logIndex) => ({
      address: baseLog.address,
      blockHash,
      blockNumber: '0xa',
      data,
      logIndex: `0x${logIndex.toString(16)}`,
      removed: false,
      topics: encodeEventTopics({ abi: [event], eventName: event.name, args }),
      transactionHash,
      transactionIndex: '0x0',
    }))
    const request = vi.fn().mockResolvedValue(rawLogs)
    const client = createPublicClient({ transport: custom({ request }) })

    const logs = await fetchPairLogs(client, 1n, 10n)

    expect(request).toHaveBeenCalledTimes(1)
    expect(logs.swapLogs[0].args).toMatchObject({ amount0In: 1n, amount1Out: 4n })
    expect(logs.mintLogs[0].args).toMatchObject({ amount0: 5n, amount1: 6n })
    expect(logs.burnLogs[0].args).toMatchObject({ amount0: 7n, amount1: 8n })
    expect(logs.syncLogs[0].args).toMatchObject({ reserve0: 9n, reserve1: 10n })
  })

  it('decodes and separates all event types with one RPC call', async () => {
    const getLogs = vi.fn().mockResolvedValue(classicLogs)
    const logs = await fetchPairLogs({ getLogs } as never, 1n, 10n)

    expect(getLogs).toHaveBeenCalledTimes(1)
    expect(getLogs).toHaveBeenCalledWith(expect.objectContaining({ fromBlock: 1n, toBlock: 10n, events: expect.any(Array) }))
    expect(logs.swapLogs[0]).toMatchObject({ eventName: 'Swap', args: { amount0In: 1n } })
    expect(logs.mintLogs[0]).toMatchObject({ eventName: 'Mint', args: { amount0: 5n } })
    expect(logs.burnLogs[0]).toMatchObject({ eventName: 'Burn', args: { amount0: 7n } })
    expect(logs.syncLogs[0]).toMatchObject({ eventName: 'Sync', args: { reserve0: 9n } })
  })
})

describe('resilient eth_getLogs ranges', () => {
  it('keeps a configured 10-block range as one request', async () => {
    const getLogs = vi.fn().mockResolvedValue([])
    await fetchLogsResilient({ getLogs } as never, { address: baseLog.address as `0x${string}`, events: [] }, 1n, 10n)
    expect(getLogs).toHaveBeenCalledTimes(1)
    expect(getLogs).toHaveBeenCalledWith(expect.objectContaining({ fromBlock: 1n, toBlock: 10n }))
  })

  it('splits an oversized range without gaps or overlaps', async () => {
    const successful: Array<[bigint, bigint]> = []
    const getLogs = vi.fn(async ({ fromBlock, toBlock }: { fromBlock: bigint; toBlock: bigint }) => {
      if (toBlock - fromBlock + 1n > 10n) throw new Error('Log response size exceeded. You can make eth_getLogs requests with up to a 10 block range.')
      successful.push([fromBlock, toBlock])
      return []
    })

    await fetchLogsResilient({ getLogs } as never, { address: baseLog.address as `0x${string}`, events: [] }, 1n, 25n)

    expect(successful).toEqual([[1n, 7n], [8n, 13n], [14n, 19n], [20n, 25n]])
    expect(successful[0][0]).toBe(1n)
    expect(successful.at(-1)?.[1]).toBe(25n)
    successful.slice(1).forEach((range, index) => expect(range[0]).toBe(successful[index][1] + 1n))
  })

  it('never queries an empty range', () => {
    const getLogs = vi.fn()
    expect(() => fetchLogsResilient(
      { getLogs } as never,
      { address: baseLog.address as `0x${string}`, events: [] },
      11n,
      10n,
    )).toThrow('range must not be empty')
    expect(getLogs).not.toHaveBeenCalled()
  })

  it('does not retry deterministic RPC errors', async () => {
    const getLogs = vi.fn().mockRejectedValue(new Error('invalid argument 0: hex string has odd length'))
    await expect(fetchLogsResilient(
      { getLogs } as never,
      { address: baseLog.address as `0x${string}`, events: [] },
      1n,
      10n,
      { sleep: vi.fn(), log: vi.fn() },
    )).rejects.toThrow('non_retryable')
    expect(getLogs).toHaveBeenCalledTimes(1)
  })

  it('retries a temporary rate limit and then succeeds', async () => {
    const getLogs = vi.fn()
      .mockRejectedValueOnce(new Error('HTTP request failed with status 429'))
      .mockResolvedValueOnce(classicLogs)
    const sleep = vi.fn().mockResolvedValue(undefined)

    const logs = await fetchLogsResilient(
      { getLogs } as never,
      { address: baseLog.address as `0x${string}`, events: [] },
      1n,
      10n,
      { sleep, random: () => 0, log: vi.fn() },
    )

    expect(logs).toEqual(classicLogs)
    expect(getLogs).toHaveBeenCalledTimes(2)
    expect(sleep).toHaveBeenCalledTimes(1)
  })

  it('uses bounded exponential backoff with jitter between retries', async () => {
    const getLogs = vi.fn()
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockRejectedValueOnce(new Error('503 Service Unavailable'))
      .mockResolvedValueOnce([])
    const sleep = vi.fn().mockResolvedValue(undefined)

    await fetchLogsResilient(
      { getLogs } as never,
      { address: baseLog.address as `0x${string}`, events: [] },
      1n,
      10n,
      { sleep, random: () => 0, log: vi.fn() },
    )

    expect(sleep.mock.calls).toEqual([[125], [250]])
  })

  it('redacts RPC credentials from retry logs and exhausted errors', async () => {
    const secretUrl = 'https://eth-mainnet.g.alchemy.com/v2/super-secret-api-key'
    const getLogs = vi.fn().mockRejectedValue(new Error(`429 from ${secretUrl} Authorization: Bearer top-secret`))
    const entries: Record<string, unknown>[] = []

    await expect(fetchLogsResilient(
      { getLogs } as never,
      { address: baseLog.address as `0x${string}`, events: [] },
      1n,
      10n,
      { maxAttempts: 2, sleep: async () => undefined, random: () => 0, providerUrl: secretUrl, log: (entry: Record<string, unknown>) => entries.push(entry) },
    )).rejects.toThrow('RPC eth_getLogs failed after 2 attempts (rate_limit)')

    const serialized = JSON.stringify(entries)
    expect(serialized).toContain('eth-mainnet.g.alchemy.com')
    expect(serialized).not.toContain('super-secret-api-key')
    expect(serialized).not.toContain('top-secret')
    expect(serialized).not.toContain('Authorization')
  })
})
