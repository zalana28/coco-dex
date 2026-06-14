import { describe, expect, it } from 'vitest'
import { COCO_STABLE_POOL_ADDRESS, EURC_ADDRESS, USDC_ADDRESS } from './arcClient.js'
import { mapStablePoolLogsToRows, type StablePoolSnapshot } from './stablePoolEvents.js'

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
