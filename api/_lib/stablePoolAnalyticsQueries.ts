import type { SupabaseClient } from '@supabase/supabase-js'
import { arcTestnet, COCO_STABLE_POOL_ADDRESS } from './arcClient.js'

export function stablePoolMetadata() {
  return {
    chainId: arcTestnet.id,
    network: 'Arc Testnet',
    poolAddress: COCO_STABLE_POOL_ADDRESS,
    status: 'LP Beta',
    routed: false,
    indexedSeparately: true,
  }
}

export async function getStablePoolSummary(supabase: SupabaseClient) {
  const [snapshotResult, eventsResult, runResult] = await Promise.all([
    supabase
      .from('stable_pool_reserve_snapshots')
      .select('*')
      .eq('pool_address', COCO_STABLE_POOL_ADDRESS.toLowerCase())
      .order('block_number', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('stable_pool_events')
      .select('id', { count: 'exact', head: true })
      .eq('pool_address', COCO_STABLE_POOL_ADDRESS.toLowerCase()),
    supabase
      .from('stable_pool_indexer_runs')
      .select('*')
      .eq('pool_address', COCO_STABLE_POOL_ADDRESS.toLowerCase())
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  return {
    ...stablePoolMetadata(),
    latestSnapshot: snapshotResult.data ?? null,
    eventCount: eventsResult.count ?? 0,
    latestRun: runResult.data ?? null,
  }
}

export async function getStablePoolEvents(supabase: SupabaseClient, limit = 20) {
  const { data } = await supabase
    .from('stable_pool_events')
    .select('*')
    .eq('pool_address', COCO_STABLE_POOL_ADDRESS.toLowerCase())
    .order('block_number', { ascending: false })
    .order('log_index', { ascending: false })
    .limit(limit)

  return {
    ...stablePoolMetadata(),
    events: data ?? [],
  }
}

export async function getStablePoolReserves(supabase: SupabaseClient, limit = 24) {
  const { data } = await supabase
    .from('stable_pool_reserve_snapshots')
    .select('*')
    .eq('pool_address', COCO_STABLE_POOL_ADDRESS.toLowerCase())
    .order('block_number', { ascending: false })
    .limit(limit)

  return {
    ...stablePoolMetadata(),
    snapshots: data ?? [],
  }
}

export async function getStablePoolHealth(supabase: SupabaseClient) {
  const { data } = await supabase
    .from('stable_pool_indexer_runs')
    .select('*')
    .eq('pool_address', COCO_STABLE_POOL_ADDRESS.toLowerCase())
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return {
    ...stablePoolMetadata(),
    configured: true,
    latestRun: data ?? null,
  }
}
