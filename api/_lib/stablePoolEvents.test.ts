import { describe, expect, it, vi } from 'vitest'
import { COCO_STABLE_POOL_ADDRESS, EURC_ADDRESS, USDC_ADDRESS } from './arcClient.js'
import { fetchStablePoolLogs, mapStablePoolLogsToRows, type StablePoolSnapshot } from './stablePoolEvents.js'

const snapshot: StablePoolSnapshot = {
  pool_address: COCO_STABLE_POOL_ADDRESS.toLowerCase(),
  chain_id: 5042002,
  block_number: 45650000,
  block_timestamp: '2026-06-09T00:00:00.000Z',
  token0_address: USDC_ADDRESS.toLowerCase(),
  token1_address: EURC_ADDRESS.toLowerCase(),
  reserve0_raw: '1000000',
  reserve1_raw: '1000000',
  lp_total_supply_raw: '1000000000000000000',
  lp_decimals: 18,
}

const emptyLogs = {
  liquidityAddedLogs: [],
  liquidityRemovedLogs: [],
  swapLogs: [],
  feeUpdatedLogs: [],
  pausedLogs: [],
  unpausedLogs: [],
}

describe('stable pool event mapping', () => {
  it('fetches and separates all stable event types with one RPC call', async () => {
    const events = ['LiquidityAdded', 'LiquidityRemoved', 'Swap', 'FeeUpdated', 'Paused', 'Unpaused']
    const getLogs = vi.fn().mockResolvedValue(events.map((eventName, logIndex) => ({ eventName, logIndex })))

    const logs = await fetchStablePoolLogs({ getLogs } as never, 1n, 10n)

    expect(getLogs).toHaveBeenCalledTimes(1)
    expect(getLogs).toHaveBeenCalledWith(expect.objectContaining({ fromBlock: 1n, toBlock: 10n, events: expect.any(Array) }))
    expect(logs.liquidityAddedLogs).toHaveLength(1)
    expect(logs.liquidityRemovedLogs).toHaveLength(1)
    expect(logs.swapLogs).toHaveLength(1)
    expect(logs.feeUpdatedLogs).toHaveLength(1)
    expect(logs.pausedLogs).toHaveLength(1)
    expect(logs.unpausedLogs).toHaveLength(1)
  })

  it('handles missing events gracefully while snapshots remain available separately', () => {
    const rows = mapStablePoolLogsToRows({
      logs: emptyLogs,
      blockTimestamps: new Map(),
      snapshot,
    })

    expect(rows).toEqual([])
  })

  it('maps available stable pool events into separated event rows', () => {
    const rows = mapStablePoolLogsToRows({
      logs: {
        ...emptyLogs,
        liquidityAddedLogs: [{
          transactionHash: '0xabc',
          blockNumber: 45650000n,
          logIndex: 7,
          args: {
            provider: '0x1111111111111111111111111111111111111111',
            to: '0x2222222222222222222222222222222222222222',
            amount0: 100n,
            amount1: 200n,
            lpMinted: 300n,
          },
        }],
      },
      blockTimestamps: new Map([[45650000n, '2026-06-09T00:00:00.000Z']]),
      snapshot,
    })

    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      pool_address: COCO_STABLE_POOL_ADDRESS.toLowerCase(),
      chain_id: 5042002,
      event_type: 'liquidity_added',
      tx_hash: '0xabc',
      log_index: 7,
      token0_address: USDC_ADDRESS.toLowerCase(),
      token1_address: EURC_ADDRESS.toLowerCase(),
      reserve0_raw: '1000000',
      reserve1_raw: '1000000',
      lp_total_supply_raw: '1000000000000000000',
      lp_decimals: 18,
      amount0_raw: '100',
      amount1_raw: '200',
      lp_amount_raw: '300',
    })
  })
})
