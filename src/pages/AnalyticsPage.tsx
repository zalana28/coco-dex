import { Card } from '@/components/common/Card'
import { MOCK_PROTOCOL_STATS, MOCK_POOLS, MOCK_TOP_TOKENS } from '@/constants/mock'
import { formatCompact } from '@/utils/format'
import { TrendingUp, BarChart3, DollarSign, Activity } from 'lucide-react'

export function AnalyticsPage() {
  return (
    <div className="pt-24 pb-12 px-4 mx-auto max-w-5xl">
      <h1 className="text-2xl font-bold text-coco-dark-text mb-6">Analytics</h1>

      {/* Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <MetricCard icon={<DollarSign />} label="Total Value Locked" value={formatCompact(MOCK_PROTOCOL_STATS.tvl)} />
        <MetricCard icon={<BarChart3 />} label="24h Volume" value={formatCompact(MOCK_PROTOCOL_STATS.volume24h)} />
        <MetricCard icon={<TrendingUp />} label="Total Fees" value={formatCompact(MOCK_PROTOCOL_STATS.totalFees)} />
        <MetricCard icon={<Activity />} label="Total Trades" value={MOCK_PROTOCOL_STATS.totalTrades.toLocaleString()} />
      </div>

      {/* Chart Placeholder */}
      <Card className="p-6 mb-8">
        <h2 className="text-lg font-semibold text-coco-dark-text mb-4">TVL Over Time</h2>
        <div className="h-48 rounded-xl bg-coco-dark-bg border border-coco-dark-border flex items-center justify-center">
          <p className="text-sm text-coco-dark-muted">Chart available when connected to live data</p>
        </div>
      </Card>

      {/* Tables */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Top Pools */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-coco-dark-text mb-4">Top Pools</h2>
          <PoolsTable />
        </Card>

        {/* Top Tokens */}
        <Card className="p-5">
          <h2 className="text-lg font-semibold text-coco-dark-text mb-4">Top Tokens</h2>
          <TokensTable />
        </Card>
      </div>
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

function PoolsTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-coco-dark-border">
            <th className="text-left py-2 text-xs text-coco-dark-muted font-medium">Pool</th>
            <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">TVL</th>
            <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">Volume</th>
            <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">APR</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_POOLS.map((pool) => (
            <tr key={pool.id} className="border-b border-coco-dark-border/50">
              <td className="py-3 font-medium text-coco-dark-text">{pool.token0}/{pool.token1}</td>
              <td className="py-3 text-right font-mono text-coco-dark-text">{formatCompact(pool.tvl)}</td>
              <td className="py-3 text-right font-mono text-coco-dark-text">{formatCompact(pool.volume24h)}</td>
              <td className="py-3 text-right font-mono text-coco-green-500">{pool.apr}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function TokensTable() {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-coco-dark-border">
            <th className="text-left py-2 text-xs text-coco-dark-muted font-medium">Token</th>
            <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">Price</th>
            <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">Volume</th>
            <th className="text-right py-2 text-xs text-coco-dark-muted font-medium">TVL</th>
          </tr>
        </thead>
        <tbody>
          {MOCK_TOP_TOKENS.map((token) => (
            <tr key={token.symbol} className="border-b border-coco-dark-border/50">
              <td className="py-3">
                <div>
                  <span className="font-medium text-coco-dark-text">{token.symbol}</span>
                  <span className="ml-2 text-xs text-coco-dark-muted">{token.name}</span>
                </div>
              </td>
              <td className="py-3 text-right font-mono text-coco-dark-text">${token.price.toFixed(3)}</td>
              <td className="py-3 text-right font-mono text-coco-dark-text">{formatCompact(token.volume24h)}</td>
              <td className="py-3 text-right font-mono text-coco-dark-text">{formatCompact(token.tvl)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
