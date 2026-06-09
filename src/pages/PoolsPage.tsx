import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAccount } from 'wagmi'
import { AlertTriangle, Check, Copy, Droplets, ExternalLink, Minus, Plus, X } from 'lucide-react'
import { Card } from '@/components/common/Card'
import { ConnectWalletButton } from '@/components/common/ConnectWalletButton'
import { TokenIcon } from '@/components/common/TokenIcon'
import { CocoStableAddLiquidityPanel } from '@/components/pools/CocoStableAddLiquidityPanel'
import { CocoStableRemoveLiquidityPanel } from '@/components/pools/CocoStableRemoveLiquidityPanel'
import { useCocoStablePool } from '@/hooks/useCocoStablePool'
import { useLPBalance } from '@/hooks/useLPBalance'
import { usePairReserves } from '@/hooks/usePairReserves'
import { useXyloNetStablePool } from '@/hooks/useXyloNetStablePool'
import { formatCompact, formatPercentage, formatTokenAmount } from '@/utils/format'

type Tab = 'positions' | 'pools'
type PoolId = 'classic' | 'stable'
type ModalAction = 'select' | 'add' | 'remove'

type LiquidityModalState = {
  action: ModalAction
  poolId?: PoolId
}

type StablePoolObservability = {
  status?: 'not_configured' | string
  reason?: string
  latestSnapshot?: {
    block_number?: number
    block_timestamp?: string | null
    reserve0_raw?: string
    reserve1_raw?: string
    lp_total_supply_raw?: string
    lp_decimals?: number
  } | null
  eventCount?: number
  latestRun?: {
    status?: string
    started_at?: string
    finished_at?: string | null
    events_indexed?: number
    snapshots_written?: number
  } | null
}

function useStablePoolObservability() {
  const [data, setData] = useState<StablePoolObservability | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchSummary = useCallback(() => {
    setLoading(true)
    fetch('/api/analytics/stable-pool/summary')
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`)
        return response.json()
      })
      .then((payload: StablePoolObservability) => {
        setData(payload)
        setLoading(false)
      })
      .catch(() => {
        setData({ status: 'not_configured', reason: 'Stable pool analytics are not configured yet.' })
        setLoading(false)
      })
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchSummary()
  }, [fetchSummary])

  return { data, loading, refetch: fetchSummary }
}

export function PoolsPage() {
  const [activeTab, setActiveTab] = useState<Tab>('positions')
  const [modal, setModal] = useState<LiquidityModalState | null>(null)
  const [detailsPool, setDetailsPool] = useState<PoolId | null>(null)
  const { address, isConnected } = useAccount()
  const { reserveUsdc, reserveEurc, hasLiquidity, isLoading } = usePairReserves()
  const classicLp = useLPBalance(address)
  const stablePool = useCocoStablePool(address)
  const externalStablePool = useXyloNetStablePool(address)
  const stablePoolObservability = useStablePoolObservability()

  const openNewPosition = () => setModal({ action: 'select' })
  const openAdd = (poolId: PoolId) => setModal({ action: 'add', poolId })
  const openRemove = (poolId: PoolId) => setModal({ action: 'remove', poolId })
  const closeModal = () => setModal(null)
  const hasClassicPosition = classicLp.balance !== undefined && classicLp.balance > 0n
  const hasStablePosition = stablePool.userLpBalance !== undefined && stablePool.userLpBalance > 0n
  const totalPositions = Number(hasClassicPosition) + Number(hasStablePosition)
  const classicPositionValue = hasClassicPosition && hasLiquidity && reserveUsdc && reserveEurc
    ? (Number(reserveUsdc) / 1e6 + Number(reserveEurc) / 1e6 * 1.086) * classicLp.share
    : 0
  const stablePositionValue = hasStablePosition && stablePool.totalSupply > 0n && stablePool.userLpBalance
    ? (
      Number((stablePool.userLpBalance * stablePool.reserve0) / stablePool.totalSupply) / 1e6 +
      Number((stablePool.userLpBalance * stablePool.reserve1) / stablePool.totalSupply) / 1e6 * 1.086
    )
    : 0

  return (
    <div className="page-fade mx-auto max-w-4xl px-3 pb-12 pt-28 sm:px-4 sm:pt-24">
      <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-coco-dark-text">Positions</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-coco-dark-muted">
            Manage liquidity on Coco DEX.
          </p>
        </div>
        <button
          type="button"
          onClick={openNewPosition}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-coco-green-500 px-4 py-2 text-sm font-semibold text-white shadow-lg shadow-coco-green-500/25 transition-all hover:-translate-y-0.5 hover:bg-coco-green-600"
        >
          <Plus className="h-4 w-4" />
          New Position
        </button>
      </div>

      <PositionsSummary
        totalPositions={isConnected ? totalPositions : 0}
        estimatedLiquidity={classicPositionValue + stablePositionValue}
        stableObservability={stablePoolObservability.data}
        stableObservabilityLoading={stablePoolObservability.loading}
      />

      <div className="mb-5 mt-5 flex w-full gap-1 rounded-xl border border-coco-dark-border bg-coco-dark-surface/70 p-1 backdrop-blur-xl">
        <TabButton active={activeTab === 'positions'} onClick={() => setActiveTab('positions')}>My Positions</TabButton>
        <TabButton active={activeTab === 'pools'} onClick={() => setActiveTab('pools')}>Pools</TabButton>
      </div>

      {activeTab === 'pools' ? (
        <PoolsTab
          reserveUsdc={reserveUsdc}
          reserveEurc={reserveEurc}
          hasLiquidity={hasLiquidity}
          isLoading={isLoading}
          classicLpBalance={classicLp.balance}
          stablePool={stablePool}
          stableObservability={stablePoolObservability.data}
          stableObservabilityLoading={stablePoolObservability.loading}
          onAdd={openAdd}
          onDetails={setDetailsPool}
        />
      ) : (
        <MyPositions
          isConnected={isConnected}
          reserveUsdc={reserveUsdc}
          reserveEurc={reserveEurc}
          hasLiquidity={hasLiquidity}
          classicLpBalance={classicLp.balance}
          classicShare={classicLp.share}
          stablePool={stablePool}
          onAdd={openAdd}
          onRemove={openRemove}
          onDetails={setDetailsPool}
          onNewPosition={openNewPosition}
        />
      )}

      <LiquidityActionModal
        modal={modal}
        stablePool={stablePool}
        onClose={closeModal}
        onSelectPool={(poolId) => setModal({ action: 'add', poolId })}
      />
      <PoolDetailsDrawer
        poolId={detailsPool}
        reserveUsdc={reserveUsdc}
        reserveEurc={reserveEurc}
        hasLiquidity={hasLiquidity}
        isLoading={isLoading}
        stablePool={stablePool}
        stableObservability={stablePoolObservability.data}
        stableObservabilityLoading={stablePoolObservability.loading}
        externalStablePool={externalStablePool}
        onClose={() => setDetailsPool(null)}
      />
    </div>
  )
}

function PositionsSummary({
  totalPositions,
  estimatedLiquidity,
  stableObservability,
  stableObservabilityLoading,
}: {
  totalPositions: number
  estimatedLiquidity: number
  stableObservability: StablePoolObservability | null
  stableObservabilityLoading: boolean
}) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <SummaryTile label="Positions" value={String(totalPositions)} />
      <SummaryTile label="Est. liquidity" value={estimatedLiquidity > 0 ? formatCompact(estimatedLiquidity) : '$0'} />
      <SummaryTile label="Network" value="Arc Testnet" />
      <SummaryTile label="Stable Pool" value={stableObservabilityLoading ? 'Checking...' : stableObservability?.status === 'not_configured' ? 'Beta / Quote-only' : 'Beta / Quote-only'} />
    </div>
  )
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-coco-dark-border bg-coco-dark-surface/70 p-3">
      <p className="text-[11px] text-coco-dark-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold text-coco-dark-text">{value}</p>
    </div>
  )
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 rounded-lg px-4 py-2 text-sm font-medium transition-colors sm:flex-none ${
        active
          ? 'bg-coco-green-500/15 text-coco-dark-text'
          : 'text-coco-dark-muted hover:text-coco-dark-text'
      }`}
    >
      {children}
    </button>
  )
}

function PoolsTab({
  reserveUsdc,
  reserveEurc,
  hasLiquidity,
  isLoading,
  classicLpBalance,
  stablePool,
  stableObservability,
  stableObservabilityLoading,
  onAdd,
  onDetails,
}: {
  reserveUsdc: bigint | undefined
  reserveEurc: bigint | undefined
  hasLiquidity: boolean
  isLoading: boolean
  classicLpBalance: bigint | undefined
  stablePool: ReturnType<typeof useCocoStablePool>
  stableObservability: StablePoolObservability | null
  stableObservabilityLoading: boolean
  onAdd: (poolId: PoolId) => void
  onDetails: (poolId: PoolId) => void
}) {
  const classicTvl = hasLiquidity && reserveUsdc && reserveEurc
    ? (Number(reserveUsdc) / 1e6) + (Number(reserveEurc) / 1e6 * 1.086)
    : 0
  const [stableToken0, stableToken1] = stablePool.pool.tokens
  const stableTvl = (Number(stablePool.reserve0) / 1e6) + (Number(stablePool.reserve1) / 1e6 * 1.086)

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <PoolCard
          pair="USDC / EURC"
          poolType="Classic Coco V2"
          fee="0.30%"
          tvl={isLoading ? '...' : hasLiquidity ? formatCompact(classicTvl) : '$0'}
          reserveSummary={isLoading ? '...' : `${formatTokenAmount(reserveUsdc ?? 0n, 6)} USDC / ${formatTokenAmount(reserveEurc ?? 0n, 6)} EURC`}
          lpBalance={classicLpBalance !== undefined ? formatTokenAmount(classicLpBalance, 18) : 'Connect wallet to read'}
          badges={['Arc Testnet', hasLiquidity ? 'Active' : 'No Liquidity', 'Routed']}
          onAdd={() => onAdd('classic')}
          onDetails={() => onDetails('classic')}
        />

        <PoolCard
          pair={stablePool.pool.pairLabel}
          poolType="Native Stable Pool Beta"
          fee={`${(Number(stablePool.feeBps) / 100).toFixed(2)}%`}
          tvl={stablePool.isLoading ? '...' : formatCompact(stableTvl)}
          reserveSummary={stablePool.isLoading ? '...' : `${formatTokenAmount(stablePool.reserve0, stableToken0.decimals)} ${stableToken0.symbol} / ${formatTokenAmount(stablePool.reserve1, stableToken1.decimals)} ${stableToken1.symbol}`}
          lpBalance={stablePool.userLpBalance !== undefined ? `${formatTokenAmount(stablePool.userLpBalance, stablePool.lpDecimals)} cSLP` : 'Connect wallet to read'}
          badges={['Arc Testnet', 'LP Beta', 'Unaudited', 'Not Routed', 'Quote-only']}
          health={<StablePoolHealthBadge observability={stableObservability} isLoading={stableObservabilityLoading} />}
          onAdd={() => onAdd('stable')}
          onDetails={() => onDetails('stable')}
        />
      </div>
    </div>
  )
}

function PoolCard({
  pair,
  poolType,
  fee,
  tvl,
  reserveSummary,
  lpBalance,
  badges,
  health,
  onAdd,
  onDetails,
}: {
  pair: string
  poolType: string
  fee: string
  tvl: string
  reserveSummary: string
  lpBalance: string
  badges: string[]
  health?: React.ReactNode
  onAdd: () => void
  onDetails: () => void
}) {
  return (
    <Card className="flex min-w-0 flex-col p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex -space-x-2">
            <TokenIcon symbol="USDC" color="#2775CA" size="md" />
            <TokenIcon symbol="EURC" color="#1434CB" size="md" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-coco-dark-text">{pair}</h2>
            <p className="text-xs text-coco-dark-muted">{poolType}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap justify-end gap-1.5">
          {badges.map((badge) => <Badge key={badge}>{badge}</Badge>)}
        </div>
      </div>

      {health && <div className="mt-3">{health}</div>}

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-coco-dark-border pt-4 sm:grid-cols-3">
        <PoolMetric label="TVL / reserves" value={tvl} mono />
        <PoolMetric label="Fee" value={fee} />
        <PoolMetric label="Your LP" value={lpBalance} mono />
      </div>
      <p className="mt-3 truncate text-xs text-coco-dark-muted">{reserveSummary}</p>

      <div className="mt-4 flex flex-col gap-2 sm:flex-row">
        <button
          type="button"
          onClick={onAdd}
          className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-lg bg-coco-green-500/10 px-3 py-2 text-sm font-semibold text-coco-green-500 transition-colors hover:bg-coco-green-500/20"
        >
          <Plus className="h-4 w-4" />
          Add Liquidity
        </button>
        <button
          type="button"
          onClick={onDetails}
          className="inline-flex min-h-10 flex-1 items-center justify-center rounded-lg border border-coco-dark-border bg-coco-dark-bg/70 px-3 py-2 text-sm font-semibold text-coco-dark-text transition-colors hover:border-coco-teal-400/30"
        >
          Details
        </button>
      </div>
    </Card>
  )
}

function ClassicPoolDetails({
  reserveUsdc,
  reserveEurc,
  hasLiquidity,
  isLoading,
}: {
  reserveUsdc: bigint | undefined
  reserveEurc: bigint | undefined
  hasLiquidity: boolean
  isLoading: boolean
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <PoolMetric label="Status" value={isLoading ? '...' : hasLiquidity ? 'Active' : 'No Liquidity'} />
      <PoolMetric label="USDC reserve" value={isLoading ? '...' : formatTokenAmount(reserveUsdc ?? 0n, 6)} mono />
      <PoolMetric label="EURC reserve" value={isLoading ? '...' : formatTokenAmount(reserveEurc ?? 0n, 6)} mono />
    </div>
  )
}

function StablePoolAdvancedDetails({
  stablePool,
  observability,
  observabilityLoading,
  externalStablePool,
}: {
  stablePool: ReturnType<typeof useCocoStablePool>
  observability: StablePoolObservability | null
  observabilityLoading: boolean
  externalStablePool: ReturnType<typeof useXyloNetStablePool>
}) {
  const [token0, token1] = stablePool.pool.tokens
  const latestRun = observability?.latestRun
  const snapshot = observability?.latestSnapshot
  const isConfigured = observability?.status !== 'not_configured' && Boolean(snapshot || latestRun)

  return (
    <div className="space-y-4">
      {(stablePool.hasReadError || stablePool.isWrongNetwork) && (
        <div className="rounded-lg border border-coco-amber-500/20 bg-coco-amber-500/10 p-3">
          <p className="text-xs leading-relaxed text-coco-amber-500">
            {stablePool.hasReadError
              ? 'On-chain data is temporarily unavailable. Displaying last documented Arc Testnet values.'
              : 'Your wallet is not on Arc Testnet. The panel still reads Arc Testnet data only.'}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AddressRow label="Pool address" address={stablePool.pool.poolAddress} />
        <AddressRow label="LP token address" address={stablePool.lpTokenAddress} />
        <AddressRow label={`${token0.symbol} token`} address={stablePool.token0Address} />
        <AddressRow label={`${token1.symbol} token`} address={stablePool.token1Address} />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <PoolMetric label="A" value={stablePool.isLoading ? '...' : stablePool.amplificationParameter.toString()} mono />
        <PoolMetric label="Pool status" value={stablePool.paused ? 'Paused' : 'Live read'} />
        <PoolMetric label="Total cSLP" value={stablePool.isLoading ? '...' : formatTokenAmount(stablePool.totalSupply, stablePool.lpDecimals)} mono />
        <PoolMetric label="Router" value="Disabled" />
      </div>

      <div className="rounded-xl border border-coco-dark-border bg-coco-dark-surface/50 p-3">
        <p className="text-xs uppercase tracking-[0.18em] text-coco-dark-muted">Sample quote checks</p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <PoolMetric
            label="0.1 USDC -> EURC"
            value={stablePool.isLoading ? '...' : `${formatTokenAmount(stablePool.quoteUsdcToEurc, token1.decimals)} ${token1.symbol}`}
            mono
          />
          <PoolMetric
            label="0.1 EURC -> USDC"
            value={stablePool.isLoading ? '...' : `${formatTokenAmount(stablePool.quoteEurcToUsdc, token0.decimals)} ${token0.symbol}`}
            mono
          />
        </div>
      </div>

      <div className="rounded-xl border border-coco-amber-500/20 bg-coco-amber-500/5 p-3">
        <div className="flex flex-wrap gap-2">
          <Badge>Stable Pool Observability</Badge>
          <Badge>Separate indexer</Badge>
          <Badge>Classic TVL excluded</Badge>
        </div>
        {!isConfigured && !observabilityLoading && (
          <p className="mt-3 text-xs leading-relaxed text-coco-amber-500">Stable pool analytics are not configured yet.</p>
        )}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <PoolMetric label="Indexer status" value={observabilityLoading ? '...' : latestRun?.status ?? (isConfigured ? 'Unknown' : 'Not configured')} />
          <PoolMetric label="Indexed events" value={observabilityLoading ? '...' : observability?.eventCount?.toLocaleString() ?? 'Unavailable'} mono />
          <PoolMetric label="Snapshots written" value={observabilityLoading ? '...' : latestRun?.snapshots_written?.toLocaleString() ?? 'Unavailable'} mono />
        </div>
      </div>

      <details>
        <summary className="cursor-pointer text-sm font-semibold text-coco-dark-text">External liquidity sources</summary>
        <div className="mt-3 rounded-xl border border-coco-dark-border bg-coco-dark-surface/50 p-3">
          <ExternalStablePoolDetails externalStablePool={externalStablePool} />
        </div>
      </details>

      <div className="flex flex-wrap gap-2">
        <a href={stablePool.pool.poolArcscanUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-coco-dark-border px-3 py-2 text-xs font-medium text-coco-dark-text hover:border-coco-teal-400/40">
          View contract
          <ExternalLink className="h-3 w-3" />
        </a>
        <a href={stablePool.pool.lpTokenArcscanUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-lg border border-coco-dark-border px-3 py-2 text-xs font-medium text-coco-dark-text hover:border-coco-teal-400/40">
          View LP token
          <ExternalLink className="h-3 w-3" />
        </a>
        <Link to={stablePool.pool.docsPath} className="inline-flex items-center rounded-lg border border-coco-dark-border px-3 py-2 text-xs font-medium text-coco-dark-text hover:border-coco-teal-400/40">
          View docs
        </Link>
      </div>
    </div>
  )
}

function ExternalStablePoolDetails({ externalStablePool }: { externalStablePool: ReturnType<typeof useXyloNetStablePool> }) {
  const [token0, token1] = externalStablePool.pool.tokens
  const reserve0 = externalStablePool.reserve0
  const reserve1 = externalStablePool.reserve1
  const totalSupply = externalStablePool.totalSupply

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <Badge>External</Badge>
        <Badge>Read-only</Badge>
        <Badge>StableSwap</Badge>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
        <PoolMetric label="Source" value={externalStablePool.pool.source} />
        <PoolMetric label="Type" value={externalStablePool.pool.type} />
        <PoolMetric label="Fee" value={externalStablePool.pool.feeLabel} />
        <PoolMetric label="Status" value={externalStablePool.hasReadError ? 'Read issue' : 'External pool'} />
        <PoolMetric label={`${token0.symbol} Reserve`} value={externalStablePool.isLoading ? '...' : reserve0 !== undefined ? formatTokenAmount(reserve0, token0.decimals) : 'Unknown'} mono />
        <PoolMetric label={`${token1.symbol} Reserve`} value={externalStablePool.isLoading ? '...' : reserve1 !== undefined ? formatTokenAmount(reserve1, token1.decimals) : 'Unknown'} mono />
        <PoolMetric label="LP Supply" value={externalStablePool.isLoading ? '...' : totalSupply !== undefined ? formatTokenAmount(totalSupply, 18) : 'Unknown'} mono />
        <PoolMetric label="Your LP" value={externalStablePool.isLoading ? '...' : externalStablePool.userLpBalance !== undefined ? formatTokenAmount(externalStablePool.userLpBalance, 18) : 'Connect wallet to read'} mono />
      </div>
      <p className="text-[11px] leading-relaxed text-coco-dark-muted">
        This detail only reads XyloNet pool state. Liquidity management remains outside Coco DEX.
      </p>
    </div>
  )
}

function StablePoolHealthBadge({
  observability,
  isLoading,
}: {
  observability: StablePoolObservability | null
  isLoading: boolean
}) {
  const latestRun = observability?.latestRun
  const status = isLoading ? 'Checking observability...' : observability?.status === 'not_configured' ? 'Observability not configured' : `Observability ${latestRun?.status ?? 'available'}`

  return (
    <div className="rounded-lg border border-coco-amber-500/20 bg-coco-amber-500/10 px-3 py-2">
      <p className="text-xs font-medium text-coco-amber-500">{status}</p>
      <p className="mt-1 text-[11px] text-coco-dark-muted">Separate beta telemetry. Not merged into classic Coco V2 TVL.</p>
    </div>
  )
}

function MyPositions({
  isConnected,
  reserveUsdc,
  reserveEurc,
  hasLiquidity,
  classicLpBalance,
  classicShare,
  stablePool,
  onAdd,
  onRemove,
  onDetails,
  onNewPosition,
}: {
  isConnected: boolean
  reserveUsdc: bigint | undefined
  reserveEurc: bigint | undefined
  hasLiquidity: boolean
  classicLpBalance: bigint | undefined
  classicShare: number
  stablePool: ReturnType<typeof useCocoStablePool>
  onAdd: (poolId: PoolId) => void
  onRemove: (poolId: PoolId) => void
  onDetails: (poolId: PoolId) => void
  onNewPosition: () => void
}) {
  const hasClassicPosition = classicLpBalance !== undefined && classicLpBalance > 0n
  const hasStablePosition = stablePool.userLpBalance !== undefined && stablePool.userLpBalance > 0n

  if (!isConnected || (!hasClassicPosition && !hasStablePosition)) {
    return (
      <Card className="p-8 text-center sm:p-12">
        <Droplets className="mx-auto mb-4 h-12 w-12 text-coco-dark-muted" />
        <h2 className="text-lg font-medium text-coco-dark-text">{isConnected ? 'No liquidity positions yet' : 'Connect wallet to view your liquidity positions'}</h2>
        <p className="mt-2 text-sm text-coco-dark-muted">
          {isConnected
            ? 'Add liquidity to create your first Arc Testnet LP position.'
            : 'Your positions will appear here after a wallet is connected.'}
        </p>
        <div className="mt-4 flex justify-center">
          {isConnected ? (
            <button
              type="button"
              onClick={onNewPosition}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-coco-green-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-coco-green-600"
            >
              <Plus className="h-4 w-4" />
              New position
            </button>
          ) : (
            <ConnectWalletButton />
          )}
        </div>
      </Card>
    )
  }

  const withdrawableUsdc = hasLiquidity && reserveUsdc ? Number(reserveUsdc) * classicShare / 1e6 : 0
  const withdrawableEurc = hasLiquidity && reserveEurc ? Number(reserveEurc) * classicShare / 1e6 : 0
  const stableShare = stablePool.totalSupply > 0n && stablePool.userLpBalance
    ? Number((stablePool.userLpBalance * 1_000_000n) / stablePool.totalSupply) / 10_000
    : 0
  const stableUnderlying0 = stablePool.totalSupply > 0n && stablePool.userLpBalance
    ? (stablePool.userLpBalance * stablePool.reserve0) / stablePool.totalSupply
    : 0n
  const stableUnderlying1 = stablePool.totalSupply > 0n && stablePool.userLpBalance
    ? (stablePool.userLpBalance * stablePool.reserve1) / stablePool.totalSupply
    : 0n

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {hasClassicPosition && (
        <PositionCard
          pair="USDC / EURC"
          poolType="Classic Coco V2"
          lpBalance={formatTokenAmount(classicLpBalance, 18)}
          poolShare={formatPercentage(classicShare * 100)}
          underlying={`${withdrawableUsdc.toFixed(4)} USDC / ${withdrawableEurc.toFixed(4)} EURC`}
          badges={['Arc Testnet', 'Routed']}
          onAddMore={() => onAdd('classic')}
          onRemove={() => onRemove('classic')}
          onDetails={() => onDetails('classic')}
        />
      )}

      {hasStablePosition && (
        <PositionCard
          pair={stablePool.pool.pairLabel}
          poolType="Native Stable Pool Beta"
          lpBalance={`${formatTokenAmount(stablePool.userLpBalance ?? 0n, stablePool.lpDecimals)} cSLP`}
          poolShare={`${stableShare.toFixed(4)}%`}
          underlying={`${formatTokenAmount(stableUnderlying0, 6)} USDC / ${formatTokenAmount(stableUnderlying1, 6)} EURC`}
          badges={['LP Beta', 'Unaudited', 'Not Routed', 'Quote-only']}
          onAddMore={() => onAdd('stable')}
          onRemove={() => onRemove('stable')}
          onDetails={() => onDetails('stable')}
        />
      )}
    </div>
  )
}

function PositionCard({
  pair,
  poolType,
  lpBalance,
  poolShare,
  underlying,
  badges,
  onAddMore,
  onRemove,
  onDetails,
}: {
  pair: string
  poolType: string
  lpBalance: string
  poolShare: string
  underlying: string
  badges: string[]
  onAddMore: () => void
  onRemove: () => void
  onDetails: () => void
}) {
  return (
    <Card className="p-5">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex -space-x-2">
            <TokenIcon symbol="USDC" color="#2775CA" size="md" />
            <TokenIcon symbol="EURC" color="#1434CB" size="md" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-coco-dark-text">{pair}</h2>
            <p className="text-xs text-coco-dark-muted">{poolType}</p>
          </div>
        </div>
        <div className="flex flex-wrap justify-end gap-1.5">
          {badges.map((badge) => <Badge key={badge}>{badge}</Badge>)}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-coco-dark-border pt-4 sm:grid-cols-3">
        <PoolMetric label="LP balance" value={lpBalance} mono />
        <PoolMetric label="Pool share" value={poolShare} />
        <PoolMetric label="Estimated assets" value={underlying} mono />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          onClick={onAddMore}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-coco-green-500/10 px-3 py-2 text-sm font-semibold text-coco-green-500 transition-colors hover:bg-coco-green-500/20"
        >
          <Plus className="h-4 w-4" />
          Add
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-coco-red-500/10 px-3 py-2 text-sm font-semibold text-coco-red-500 transition-colors hover:bg-coco-red-500/20"
        >
          <Minus className="h-4 w-4" />
          Remove
        </button>
        <button
          type="button"
          onClick={onDetails}
          className="inline-flex min-h-10 items-center justify-center rounded-lg border border-coco-dark-border bg-coco-dark-bg/70 px-3 py-2 text-sm font-semibold text-coco-dark-text transition-colors hover:border-coco-teal-400/30"
        >
          Details
        </button>
      </div>
    </Card>
  )
}

function PoolDetailsDrawer({
  poolId,
  reserveUsdc,
  reserveEurc,
  hasLiquidity,
  isLoading,
  stablePool,
  stableObservability,
  stableObservabilityLoading,
  externalStablePool,
  onClose,
}: {
  poolId: PoolId | null
  reserveUsdc: bigint | undefined
  reserveEurc: bigint | undefined
  hasLiquidity: boolean
  isLoading: boolean
  stablePool: ReturnType<typeof useCocoStablePool>
  stableObservability: StablePoolObservability | null
  stableObservabilityLoading: boolean
  externalStablePool: ReturnType<typeof useXyloNetStablePool>
  onClose: () => void
}) {
  useEffect(() => {
    if (!poolId) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, poolId])

  if (!poolId) return null

  const isStable = poolId === 'stable'

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="pool-details-title">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close pool details" onClick={onClose} />
      <aside className="relative z-10 h-full w-full max-w-xl overflow-y-auto border-l border-coco-dark-border bg-coco-dark-surface p-4 shadow-2xl sm:p-6">
        <div className="mb-5 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-coco-teal-400">Pool details</p>
            <h2 id="pool-details-title" className="mt-1 text-xl font-semibold text-coco-dark-text">
              {isStable ? 'USDC / EURC Stable Pool Beta' : 'USDC / EURC Classic V2 Pool'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-coco-dark-border text-coco-dark-muted transition-colors hover:border-coco-teal-400/35 hover:text-coco-dark-text"
            aria-label="Close pool details"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {isStable ? (
          <StablePoolAdvancedDetails
            stablePool={stablePool}
            observability={stableObservability}
            observabilityLoading={stableObservabilityLoading}
            externalStablePool={externalStablePool}
          />
        ) : (
          <Card className="p-4">
            <ClassicPoolDetails
              reserveUsdc={reserveUsdc}
              reserveEurc={reserveEurc}
              hasLiquidity={hasLiquidity}
              isLoading={isLoading}
            />
          </Card>
        )}
      </aside>
    </div>
  )
}

function LiquidityActionModal({
  modal,
  stablePool,
  onClose,
  onSelectPool,
}: {
  modal: LiquidityModalState | null
  stablePool: ReturnType<typeof useCocoStablePool>
  onClose: () => void
  onSelectPool: (poolId: PoolId) => void
}) {
  useEffect(() => {
    if (!modal) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [modal, onClose])

  if (!modal) return null

  const title = modal.action === 'select'
    ? 'New Position'
    : modal.action === 'remove'
      ? 'Remove Liquidity'
      : 'Add Liquidity'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/65 px-3 py-3 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-labelledby="liquidity-modal-title">
      <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border border-coco-dark-border bg-coco-dark-surface p-4 shadow-2xl sm:p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-coco-teal-400">Pools action</p>
            <h2 id="liquidity-modal-title" className="mt-1 text-xl font-semibold text-coco-dark-text">{title}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-coco-dark-border text-coco-dark-muted transition-colors hover:border-coco-teal-400/35 hover:text-coco-dark-text"
            aria-label="Close liquidity modal"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {modal.action === 'select' && <PoolTypeSelector onSelect={onSelectPool} />}
        {modal.action === 'add' && modal.poolId === 'classic' && <ClassicRouteAction action="add" />}
        {modal.action === 'remove' && modal.poolId === 'classic' && <ClassicRouteAction action="remove" />}
        {modal.action === 'add' && modal.poolId === 'stable' && <StableAddModalContent stablePool={stablePool} />}
        {modal.action === 'remove' && modal.poolId === 'stable' && <StableRemoveModalContent stablePool={stablePool} />}
      </div>
    </div>
  )
}

function PoolTypeSelector({ onSelect }: { onSelect: (poolId: PoolId) => void }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onSelect('classic')}
        className="rounded-xl border border-coco-dark-border bg-coco-dark-bg/60 p-4 text-left transition-colors hover:border-coco-green-500/40"
      >
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <TokenIcon symbol="USDC" color="#2775CA" size="md" />
            <TokenIcon symbol="EURC" color="#1434CB" size="md" />
          </div>
          <div>
            <h3 className="font-semibold text-coco-dark-text">Classic Coco V2 Pool</h3>
            <p className="text-xs text-coco-dark-muted">Routed USDC/EURC liquidity</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>Arc Testnet</Badge>
          <Badge>0.30%</Badge>
          <Badge>Routed</Badge>
        </div>
      </button>

      <button
        type="button"
        onClick={() => onSelect('stable')}
        className="rounded-xl border border-coco-amber-500/25 bg-coco-amber-500/5 p-4 text-left transition-colors hover:border-coco-amber-500/45"
      >
        <div className="flex items-center gap-3">
          <div className="flex -space-x-2">
            <TokenIcon symbol="USDC" color="#2775CA" size="md" />
            <TokenIcon symbol="EURC" color="#1434CB" size="md" />
          </div>
          <div>
            <h3 className="font-semibold text-coco-dark-text">Native Stable Pool Beta</h3>
            <p className="text-xs text-coco-dark-muted">Tiny Arc Testnet LP Beta only</p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <Badge>LP Beta</Badge>
          <Badge>Unaudited</Badge>
          <Badge>Not Routed</Badge>
          <Badge>Quote-only</Badge>
        </div>
      </button>
    </div>
  )
}

function ClassicRouteAction({ action }: { action: 'add' | 'remove' }) {
  const href = action === 'add' ? '/pools/add' : '/pools/remove'

  return (
    <div className="rounded-xl border border-coco-dark-border bg-coco-dark-bg/60 p-4">
      <p className="text-sm leading-6 text-coco-dark-muted">
        Classic Coco V2 liquidity uses the existing dedicated {action === 'add' ? 'add' : 'remove'} flow.
      </p>
      <Link
        to={href}
        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-coco-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-coco-green-600"
      >
        Continue to Classic Coco V2
      </Link>
    </div>
  )
}

function StableAddModalContent({ stablePool }: { stablePool: ReturnType<typeof useCocoStablePool> }) {
  return (
    <div className="space-y-4">
      <StableBetaWarning />
      <CocoStableAddLiquidityPanel
        reserve0={stablePool.reserve0}
        reserve1={stablePool.reserve1}
        totalSupply={stablePool.totalSupply}
        lpDecimals={stablePool.lpDecimals}
        amplificationParameter={stablePool.amplificationParameter}
        paused={stablePool.paused}
        onRefreshPool={stablePool.refetch}
      />
    </div>
  )
}

function StableRemoveModalContent({ stablePool }: { stablePool: ReturnType<typeof useCocoStablePool> }) {
  return (
    <div className="space-y-4">
      <StableBetaWarning />
      <CocoStableRemoveLiquidityPanel
        reserve0={stablePool.reserve0}
        reserve1={stablePool.reserve1}
        totalSupply={stablePool.totalSupply}
        userLpBalance={stablePool.userLpBalance}
        lpDecimals={stablePool.lpDecimals}
        paused={stablePool.paused}
        onRefreshPool={stablePool.refetch}
      />
    </div>
  )
}

function StableBetaWarning() {
  return (
    <div className="rounded-xl border border-coco-amber-500/20 bg-coco-amber-500/10 p-3">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-coco-amber-500" />
        <p className="text-xs leading-relaxed text-coco-amber-500">
          Coco Native Stable Pool V1 is Arc Testnet LP Beta. Use tiny test amounts only. Unaudited. Not Routed. Quote-only for swaps.
        </p>
      </div>
    </div>
  )
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-coco-teal-400/25 bg-coco-teal-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-coco-teal-300">
      {children}
    </span>
  )
}

function CopyAddressButton({ address, label }: { address: string; label: string }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(address)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1200)
  }

  return (
    <button
      type="button"
      onClick={() => void handleCopy()}
      className="inline-grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-coco-dark-border bg-coco-dark-bg/70 text-coco-dark-muted transition-colors hover:border-coco-teal-400/40 hover:text-coco-teal-300"
      aria-label={`Copy ${label}`}
      title={`Copy ${label}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  )
}

function AddressRow({ label, address }: { label: string; address: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-coco-dark-border bg-coco-dark-bg/55 p-3">
      <p className="text-xs text-coco-dark-muted">{label}</p>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <p className="min-w-0 flex-1 truncate font-mono text-xs text-coco-dark-text">{address}</p>
        <CopyAddressButton address={address} label={label} />
      </div>
    </div>
  )
}

function PoolMetric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-coco-dark-muted">{label}</p>
      <p className={`mt-1 truncate text-sm font-medium text-coco-dark-text ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
