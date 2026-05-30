import { useState, useEffect, useCallback } from 'react'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { Card } from '@/components/common/Card'
import { formatCompact } from '@/utils/format'
import { TrendingUp, BarChart3, DollarSign, Activity, ExternalLink, RefreshCw, Info } from 'lucide-react'

interface Summary {
  tvl: number
  volume24h: number
  fees24h: number
  totalVolume: number
  totalFees: number
  totalTrades: number
}

interface Pool {
  pair: string
  address: string
  tvl: number
  reserveUsdc: number
  reserveEurc: number
  volume24h: number
  fees24h: number
  tradeCount24h: number
  fee: number
}

interface TokenInfo {
  symbol: string
  name: string
  price: number
  reserve: number
  tvl: number
}

interface ActivityEvent {
  id: number
  type: string
  txHash: string
  wallet: string | null
  volumeUsd: number
  feeUsd: number
  blockNumber: number
  timestamp: string | null
  explorerUrl: string
}

interface TvlPoint {
  tvl: number
  timestamp: string
}

interface HealthData {
  latestBlock: number
  lastIndexedBlock: number
  lagBlocks: number
  timestamp: string
}

function useFetch<T>(url: string) {
  const [state, setState] = useState<{ data: T | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null })
  const [trigger, setTrigger] = useState(0)

  useEffect(() => {
    let cancelled = false
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState((s) => ({ ...s, loading: true, error: null }))
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d) => { if (!cancelled) setState({ data: d as T, loading: false, error: null }) })
      .catch((e: Error) => { if (!cancelled) setState((s) => ({ ...s, loading: false, error: e.message })) })
    return () => { cancelled = true }
  }, [url, trigger])

  const refetch = useCallback(() => { setTrigger((t) => t + 1) }, [])

  return { ...state, refetch }
}

export function AnalyticsPage() {
  const { data: summary, loading: summaryLoading, refetch: refetchSummary } = useFetch<Summary>('/api/analytics/summary')
  const { data: pools, loading: poolsLoading, refetch: refetchPools } = useFetch<Pool[]>('/api/analytics/pools')
  const { data: tokens, loading: tokensLoading, refetch: refetchTokens } = useFetch<TokenInfo[]>('/api/analytics/tokens')
  const { data: activity, loading: activityLoading, refetch: refetchActivity } = useFetch<ActivityEvent[]>('/api/analytics/activity?limit=20')
  const { data: tvlChart, refetch: refetchChart } = useFetch<TvlPoint[]>('/api/analytics/tvl-chart?range=7d')
  const { data: health } = useFetch<HealthData>('/api/health')

  const [refreshing, setRefreshing] = useState(false)

  const handleRefreshAll = useCallback(() => {
    setRefreshing(true)
    refetchSummary()
    refetchPools()
    refetchTokens()
    refetchActivity()
    refetchChart()
    setTimeout(() => setRefreshing(false), 1000)
  }, [refetchSummary, refetchPools, refetchTokens, refetchActivity, refetchChart])

  const isEmpty = !summaryLoading && summary && summary.totalTrades === 0

  // Format chart data for Recharts
  const chartData = (tvlChart ?? []).map((p) => ({
    tvl: p.tvl,
    date: new Date(p.timestamp).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
  }))

  return (
    <div className="page-fade pt-28 sm:pt-24 pb-12 px-3 sm:px-4 mx-auto max-w-6xl">
      {/* Header with global refresh */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-coco-teal-400">Real indexed analytics</p>
          <h1 className="mt-1 text-2xl font-bold text-coco-dark-text">Analytics</h1>
        </div>
        <button
          onClick={handleRefreshAll}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors bg-coco-dark-surface/80 border border-coco-dark-border text-coco-dark-muted hover:text-coco-dark-text hover:border-coco-green-500/35 ${refreshing ? 'animate-spin-once' : ''}`}
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Indexer status info */}
      <div className="mb-6 rounded-xl bg-coco-dark-surface/55 border border-coco-dark-border p-3.5 flex items-start gap-2.5 shadow-coco-1 backdrop-blur-xl">
        <Info className="h-4 w-4 text-coco-dark-muted shrink-0 mt-0.5" />
        <div className="text-xs text-coco-dark-muted space-y-1">
          <p>Analytics updates after the indexer syncs blockchain events. External cron currently runs every 15 minutes.</p>
          {health && (
            <p className="font-mono">
              Latest block: {health.latestBlock.toLocaleString()} | Indexed: {health.lastIndexedBlock.toLocaleString()} | Lag: {health.lagBlocks.toLocaleString()} blocks
            </p>
          )}
        </div>
      </div>

      {/* Warming up notice */}
      {isEmpty && (
        <div className="mb-6 rounded-xl bg-coco-teal-400/10 border border-coco-teal-400/20 p-4">
          <p className="text-sm text-coco-teal-400">Indexer warming up — no events indexed yet. Perform a swap and wait for the next cron cycle.</p>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-8">
        <MetricCard icon={<DollarSign />} label="Total Value Locked" value={summaryLoading ? '—' : formatCompact(summary?.tvl ?? 0)} />
        <MetricCard icon={<BarChart3 />} label="24h Volume" value={summaryLoading ? '—' : formatCompact(summary?.volume24h ?? 0)} />
        <MetricCard icon={<TrendingUp />} label="24h Fees" value={summaryLoading ? '—' : formatCompact(summary?.fees24h ?? 0)} />
        <MetricCard icon={<Activity />} label="Total Trades" value={summaryLoading ? '—' : (summary?.totalTrades ?? 0).toLocaleString()} />
      </div>

      {/* TVL Chart — Recharts Area */}
      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold text-coco-dark-text mb-4">TVL Over Time</h2>
        {chartData.length >= 2 ? (
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="tvlGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22D3EE" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fill: '#94A3B8', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${formatCompact(v)}`} width={60} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#07111f', border: '1px solid rgba(148, 163, 184, 0.18)', borderRadius: 12 }}
                  labelStyle={{ color: '#CBD5E1', fontSize: 11 }}
                  formatter={(value) => [`$${Number(value).toFixed(2)}`, 'TVL']}
                />
                <Area type="monotone" dataKey="tvl" stroke="#3B82F6" strokeWidth={2} fill="url(#tvlGradient)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="h-56 rounded-xl bg-coco-dark-bg/75 border border-coco-dark-border flex items-center justify-center">
            <p className="text-sm text-coco-dark-muted">{isEmpty ? 'No data yet' : chartData.length === 1 ? 'Need more data points for chart' : 'Loading chart...'}</p>
          </div>
        )}
      </Card>

      {/* Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6 mb-8">
        {/* Top Pools */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-coco-dark-text mb-4">Top Pools</h2>
          {poolsLoading ? <Skeleton /> : pools && pools.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-coco-dark-border">
                    <th className="text-left py-2 text-xs text-coco-dark-muted font-medium">Pool</th>
                    <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">TVL</th>
                    <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">24h Vol</th>
                    <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">Fee</th>
                  </tr>
                </thead>
                <tbody>
                  {pools.map((pool) => (
                    <tr key={pool.address} className="border-b border-coco-dark-border/50">
                      <td className="py-3 font-medium text-coco-dark-text">{pool.pair}</td>
                      <td className="py-3 text-right font-mono text-coco-dark-text">{formatCompact(pool.tvl)}</td>
                      <td className="py-3 text-right font-mono text-coco-dark-text">{formatCompact(pool.volume24h)}</td>
                      <td className="py-3 text-right font-mono text-coco-green-500">{pool.fee}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-coco-dark-muted">No pool data yet</p>}
        </Card>

        {/* Top Tokens */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-coco-dark-text mb-4">Top Tokens</h2>
          {tokensLoading ? <Skeleton /> : tokens && tokens.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-coco-dark-border">
                    <th className="text-left py-2 text-xs text-coco-dark-muted font-medium">Token</th>
                    <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">Price</th>
                    <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">Reserve</th>
                  </tr>
                </thead>
                <tbody>
                  {tokens.map((token) => (
                    <tr key={token.symbol} className="border-b border-coco-dark-border/50">
                      <td className="py-3">
                        <span className="font-medium text-coco-dark-text">{token.symbol}</span>
                        <span className="ml-2 text-xs text-coco-dark-muted">{token.name}</span>
                      </td>
                      <td className="py-3 text-right font-mono text-coco-dark-text">${token.price.toFixed(4)}</td>
                      <td className="py-3 text-right font-mono text-coco-dark-text">{formatCompact(token.reserve)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="text-sm text-coco-dark-muted">No token data yet</p>}
        </Card>
      </div>

      {/* Recent Activity */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-coco-dark-text">Recent Activity</h2>
        </div>
        {activityLoading ? <Skeleton /> : activity && activity.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-coco-dark-border">
                  <th className="text-left py-2 text-xs text-coco-dark-muted font-medium">Type</th>
                  <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">Volume</th>
                  <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">Fee</th>
                  <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">Tx</th>
                </tr>
              </thead>
              <tbody>
                {activity.map((event) => (
                  <tr key={event.id} className="border-b border-coco-dark-border/50">
                    <td className="py-2.5">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        event.type === 'swap' ? 'bg-coco-green-500/10 text-coco-green-500' :
                        event.type === 'mint' ? 'bg-coco-teal-400/10 text-coco-teal-400' :
                        'bg-coco-red-500/10 text-coco-red-500'
                      }`}>
                        {event.type}
                      </span>
                    </td>
                    <td className="py-2.5 text-right font-mono text-coco-dark-text">${event.volumeUsd.toFixed(2)}</td>
                    <td className="py-2.5 text-right font-mono text-coco-dark-muted">${event.feeUsd.toFixed(4)}</td>
                    <td className="py-2.5 text-right">
                      <a href={event.explorerUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs text-coco-teal-400 hover:text-coco-teal-600">
                        {event.txHash.slice(0, 6)}...{event.txHash.slice(-4)}
                        <ExternalLink className="h-3 w-3" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm text-coco-dark-muted">No activity yet. Perform a swap to see transactions here.</p>}
      </Card>
    </div>
  )
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <Card className="p-4 hover:-translate-y-0.5 hover:border-coco-green-500/25">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-coco-teal-400 h-4 w-4">{icon}</div>
        <span className="text-xs text-coco-dark-muted">{label}</span>
      </div>
      <p className="text-xl font-bold font-mono text-coco-dark-text">{value}</p>
    </Card>
  )
}

function Skeleton() {
  return (
    <div className="space-y-3 animate-pulse">
      <div className="h-4 bg-coco-dark-border rounded w-3/4" />
      <div className="h-4 bg-coco-dark-border rounded w-1/2" />
      <div className="h-4 bg-coco-dark-border rounded w-2/3" />
    </div>
  )
}
