import { useState, useEffect } from 'react'
import { Card } from '@/components/common/Card'
import { formatCompact } from '@/utils/format'
import { TrendingUp, BarChart3, DollarSign, Activity, ExternalLink, RefreshCw } from 'lucide-react'

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

function useFetch<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refetch = () => {
    setLoading(true)
    setError(null)
    fetch(url)
      .then((r) => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then((d) => { setData(d as T); setLoading(false) })
      .catch((e) => { setError(e.message); setLoading(false) })
  }

  useEffect(() => { refetch() }, [url])

  return { data, loading, error, refetch }
}

export function AnalyticsPage() {
  const { data: summary, loading: summaryLoading } = useFetch<Summary>('/api/analytics/summary')
  const { data: pools, loading: poolsLoading } = useFetch<Pool[]>('/api/analytics/pools')
  const { data: tokens, loading: tokensLoading } = useFetch<TokenInfo[]>('/api/analytics/tokens')
  const { data: activity, loading: activityLoading, refetch: refetchActivity } = useFetch<ActivityEvent[]>('/api/analytics/activity?limit=20')
  const { data: tvlChart } = useFetch<TvlPoint[]>('/api/analytics/tvl-chart?range=7d')

  const isEmpty = !summaryLoading && summary && summary.totalTrades === 0

  return (
    <div className="pt-24 pb-12 px-4 mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-coco-dark-text mb-6">Analytics</h1>

      {/* Warming up notice */}
      {isEmpty && (
        <div className="mb-6 rounded-xl bg-coco-teal-400/10 border border-coco-teal-400/20 p-4">
          <p className="text-sm text-coco-teal-400">Indexer warming up — no events indexed yet. Perform a swap and wait for the next cron cycle.</p>
        </div>
      )}

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard icon={<DollarSign />} label="Total Value Locked" value={summaryLoading ? '—' : formatCompact(summary?.tvl ?? 0)} />
        <MetricCard icon={<BarChart3 />} label="24h Volume" value={summaryLoading ? '—' : formatCompact(summary?.volume24h ?? 0)} />
        <MetricCard icon={<TrendingUp />} label="24h Fees" value={summaryLoading ? '—' : formatCompact(summary?.fees24h ?? 0)} />
        <MetricCard icon={<Activity />} label="Total Trades" value={summaryLoading ? '—' : (summary?.totalTrades ?? 0).toLocaleString()} />
      </div>

      {/* TVL Chart */}
      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold text-coco-dark-text mb-4">TVL Over Time</h2>
        {tvlChart && tvlChart.length > 0 ? (
          <div className="h-48 rounded-xl bg-coco-dark-bg border border-coco-dark-border p-4 flex items-end gap-1">
            {tvlChart.map((point, i) => {
              const maxTvl = Math.max(...tvlChart.map((p) => p.tvl), 1)
              const height = (point.tvl / maxTvl) * 100
              return (
                <div
                  key={i}
                  className="flex-1 bg-coco-green-500/60 rounded-t-sm min-h-[2px] transition-all"
                  style={{ height: `${height}%` }}
                  title={`$${point.tvl.toFixed(2)} — ${new Date(point.timestamp).toLocaleDateString()}`}
                />
              )
            })}
          </div>
        ) : (
          <div className="h-48 rounded-xl bg-coco-dark-bg border border-coco-dark-border flex items-center justify-center">
            <p className="text-sm text-coco-dark-muted">{isEmpty ? 'No data yet' : 'Loading chart...'}</p>
          </div>
        )}
      </Card>

      {/* Tables */}
      <div className="grid lg:grid-cols-2 gap-6 mb-8">
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
          <button onClick={refetchActivity} className="p-1.5 rounded-lg hover:bg-coco-dark-bg text-coco-dark-muted hover:text-coco-dark-text transition-colors">
            <RefreshCw className="h-4 w-4" />
          </button>
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
    <Card className="p-4">
      <div className="flex items-center gap-2 mb-2">
        <div className="text-coco-dark-muted h-4 w-4">{icon}</div>
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
