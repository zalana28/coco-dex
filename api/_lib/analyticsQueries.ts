import type { SupabaseClient } from '@supabase/supabase-js'
import { PAIR_ADDRESS } from './arcClient.js'

const DECIMALS = 6
const DIVISOR = 10 ** DECIMALS

/**
 * Get summary analytics: TVL, 24h volume/fees, totals.
 */
export async function getSummary(supabase: SupabaseClient) {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  // Latest snapshot for current TVL
  const { data: latestSnapshot } = await supabase
    .from('pool_snapshots')
    .select('tvl_usd, reserve_usdc, reserve_eurc')
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .single()

  // 24h volume and fees
  const { data: recent } = await supabase
    .from('dex_events')
    .select('volume_usd, fee_usd')
    .eq('event_type', 'swap')
    .gte('block_timestamp', yesterday)

  const volume24h = recent?.reduce((sum, e) => sum + (e.volume_usd || 0), 0) ?? 0
  const fees24h = recent?.reduce((sum, e) => sum + (e.fee_usd || 0), 0) ?? 0

  // fix(4): use server-side aggregation instead of fetching all rows
  const { data: totalsData } = await supabase
    .rpc('get_swap_totals')
    .single()
    .catch(() => ({ data: null }))

  // fallback: if RPC not available, cap at 1000 rows
  let totalVolume = 0
  let totalFees = 0
  let totalTrades = 0

  if (totalsData) {
    totalVolume = totalsData.total_volume ?? 0
    totalFees = totalsData.total_fees ?? 0
    totalTrades = totalsData.total_trades ?? 0
  } else {
    const { data: totals } = await supabase
      .from('dex_events')
      .select('volume_usd, fee_usd')
      .eq('event_type', 'swap')
      .limit(1000)
    totalVolume = totals?.reduce((sum, e) => sum + (e.volume_usd || 0), 0) ?? 0
    totalFees = totals?.reduce((sum, e) => sum + (e.fee_usd || 0), 0) ?? 0
    totalTrades = totals?.length ?? 0
  }

  return {
    tvl: latestSnapshot?.tvl_usd ?? 0,
    volume24h,
    fees24h,
    totalVolume,
    totalFees,
    totalTrades,
  }
}

/**
 * Get pool data for the USDC/EURC pair.
 */
export async function getPoolData(supabase: SupabaseClient) {
  const now = new Date()
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const { data: snapshot } = await supabase
    .from('pool_snapshots')
    .select('*')
    .eq('pool_address', PAIR_ADDRESS.toLowerCase())
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .single()

  const { data: trades24h } = await supabase
    .from('dex_events')
    .select('volume_usd, fee_usd')
    .eq('event_type', 'swap')
    .gte('block_timestamp', yesterday)

  const volume24h = trades24h?.reduce((sum, e) => sum + (e.volume_usd || 0), 0) ?? 0
  const fees24h = trades24h?.reduce((sum, e) => sum + (e.fee_usd || 0), 0) ?? 0

  return {
    pair: 'USDC/EURC',
    address: PAIR_ADDRESS,
    tvl: snapshot?.tvl_usd ?? 0,
    reserveUsdc: snapshot ? Number(snapshot.reserve_usdc) / DIVISOR : 0,
    reserveEurc: snapshot ? Number(snapshot.reserve_eurc) / DIVISOR : 0,
    volume24h,
    fees24h,
    tradeCount24h: trades24h?.length ?? 0,
    fee: 0.3,
  }
}

/**
 * Get token data for USDC and EURC.
 */
export async function getTokenData(supabase: SupabaseClient) {
  const { data: snapshot } = await supabase
    .from('pool_snapshots')
    .select('reserve_usdc, reserve_eurc')
    .order('snapshot_at', { ascending: false })
    .limit(1)
    .single()

  const reserveUsdc = snapshot ? Number(snapshot.reserve_usdc) / DIVISOR : 0
  const reserveEurc = snapshot ? Number(snapshot.reserve_eurc) / DIVISOR : 0

  // fix(3): guard against division by zero — fall back to 1.08 when either reserve is empty
  const eurcPrice =
    reserveUsdc > 0 && reserveEurc > 0
      ? reserveUsdc / reserveEurc
      : 1.08

  return [
    {
      symbol: 'USDC',
      name: 'USD Coin',
      price: 1.0,
      reserve: reserveUsdc,
      tvl: reserveUsdc,
    },
    {
      symbol: 'EURC',
      name: 'Euro Coin',
      price: eurcPrice,
      reserve: reserveEurc,
      tvl: reserveEurc * eurcPrice,
    },
  ]
}

/**
 * Get recent activity (swap/mint/burn events).
 */
export async function getRecentActivity(supabase: SupabaseClient, limit = 20) {
  const { data } = await supabase
    .from('dex_events')
    .select('*')
    .in('event_type', ['swap', 'mint', 'burn'])
    .order('block_number', { ascending: false })
    .limit(limit)

  return (data ?? []).map((e) => ({
    id: e.id,
    type: e.event_type,
    txHash: e.tx_hash,
    wallet: e.wallet,
    volumeUsd: e.volume_usd,
    feeUsd: e.fee_usd,
    blockNumber: e.block_number,
    timestamp: e.block_timestamp,
    explorerUrl: `https://testnet.arcscan.app/tx/${e.tx_hash}`,
  }))
}

/**
 * Get TVL chart data (pool snapshots over time).
 */
export async function getTvlChart(supabase: SupabaseClient, range: string = '7d') {
  const days = range === '30d' ? 30 : range === '14d' ? 14 : 7
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString()

  const { data } = await supabase
    .from('pool_snapshots')
    .select('tvl_usd, snapshot_at')
    .gte('snapshot_at', since)
    .order('snapshot_at', { ascending: true })

  return (data ?? []).map((s) => ({
    tvl: s.tvl_usd,
    timestamp: s.snapshot_at,
  }))
}
