import { useState } from 'react'
import { Card } from '@/components/common/Card'
import { TokenIcon } from '@/components/common/TokenIcon'
import { MOCK_POOLS, MOCK_USER_POSITIONS } from '@/constants/mock'
import { formatCompact, formatPercentage } from '@/utils/format'
import { Plus, Minus, Droplets } from 'lucide-react'
import { useAccount } from 'wagmi'

type Tab = 'all' | 'my'

export function PoolsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('all')
  const { isConnected } = useAccount()

  return (
    <div className="pt-24 pb-12 px-4 mx-auto max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-coco-dark-text">Pools</h1>
        <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-coco-green-500 text-white text-sm font-medium hover:bg-coco-green-600 transition-colors">
          <Plus className="h-4 w-4" />
          New Position
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-coco-dark-surface border border-coco-dark-border w-fit">
        <TabButton active={activeTab === 'all'} onClick={() => setActiveTab('all')}>All Pools</TabButton>
        <TabButton active={activeTab === 'my'} onClick={() => setActiveTab('my')}>My Positions</TabButton>
      </div>

      {activeTab === 'all' ? <AllPools /> : <MyPositions isConnected={isConnected} />}
    </div>
  )
}


function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active
          ? 'bg-coco-dark-bg text-coco-dark-text'
          : 'text-coco-dark-muted hover:text-coco-dark-text'
      }`}
    >
      {children}
    </button>
  )
}

function AllPools() {
  return (
    <div className="space-y-4">
      {MOCK_POOLS.map((pool) => (
        <Card key={pool.id} className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                <TokenIcon symbol={pool.token0} color="#2775CA" size="md" />
                <TokenIcon symbol={pool.token1} color="#1434CB" size="md" />
              </div>
              <div>
                <h3 className="font-semibold text-coco-dark-text">{pool.token0} / {pool.token1}</h3>
                <p className="text-xs text-coco-dark-muted">{pool.feeTier}% fee tier</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-medium text-coco-green-500">APR {formatPercentage(pool.apr)}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-4 pt-4 border-t border-coco-dark-border">
            <div>
              <p className="text-xs text-coco-dark-muted">TVL</p>
              <p className="text-sm font-mono font-medium text-coco-dark-text">{formatCompact(pool.tvl)}</p>
            </div>
            <div>
              <p className="text-xs text-coco-dark-muted">24h Volume</p>
              <p className="text-sm font-mono font-medium text-coco-dark-text">{formatCompact(pool.volume24h)}</p>
            </div>
            <div className="flex items-end justify-end gap-2">
              <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-coco-green-500/10 text-coco-green-500 text-xs font-medium hover:bg-coco-green-500/20 transition-colors">
                <Plus className="h-3 w-3" />
                Add
              </button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  )
}


function MyPositions({ isConnected }: { isConnected: boolean }) {
  if (!isConnected) {
    return (
      <Card className="p-12 text-center">
        <Droplets className="h-12 w-12 text-coco-dark-muted mx-auto mb-4" />
        <h3 className="text-lg font-medium text-coco-dark-text">Connect your wallet</h3>
        <p className="mt-2 text-sm text-coco-dark-muted">Connect your wallet to view your liquidity positions.</p>
      </Card>
    )
  }

  if (MOCK_USER_POSITIONS.length === 0) {
    return (
      <Card className="p-12 text-center">
        <Droplets className="h-12 w-12 text-coco-dark-muted mx-auto mb-4" />
        <h3 className="text-lg font-medium text-coco-dark-text">No positions found</h3>
        <p className="mt-2 text-sm text-coco-dark-muted">Add liquidity to a pool to start earning fees.</p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {MOCK_USER_POSITIONS.map((pos) => (
        <Card key={pos.poolId} className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex -space-x-2">
                <TokenIcon symbol={pos.token0} color="#2775CA" size="md" />
                <TokenIcon symbol={pos.token1} color="#1434CB" size="md" />
              </div>
              <div>
                <h3 className="font-semibold text-coco-dark-text">{pos.token0} / {pos.token1}</h3>
                <p className="text-xs text-coco-dark-muted">Share: {formatPercentage(pos.share)}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-mono font-medium text-coco-dark-text">${pos.value.toLocaleString()}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4 pt-4 border-t border-coco-dark-border">
            <div>
              <p className="text-xs text-coco-dark-muted">{pos.token0}</p>
              <p className="text-sm font-mono text-coco-dark-text">{pos.token0Amount.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-xs text-coco-dark-muted">{pos.token1}</p>
              <p className="text-sm font-mono text-coco-dark-text">{pos.token1Amount.toLocaleString()}</p>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-coco-green-500/10 text-coco-green-500 text-sm font-medium hover:bg-coco-green-500/20 transition-colors">
              <Plus className="h-3.5 w-3.5" />
              Add
            </button>
            <button className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-coco-red-500/10 text-coco-red-500 text-sm font-medium hover:bg-coco-red-500/20 transition-colors">
              <Minus className="h-3.5 w-3.5" />
              Remove
            </button>
          </div>
        </Card>
      ))}
    </div>
  )
}
