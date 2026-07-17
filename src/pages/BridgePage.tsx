import { useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, Clock3, ExternalLink, LoaderCircle, RotateCcw, ShieldCheck, WalletCards, Zap } from 'lucide-react'
import { useBalance, useConnection, usePublicClient, useReadContract, useSwitchChain } from 'wagmi'
import { isAddress, type EIP1193Provider } from 'viem'
import { ArcTestnet, BaseSepolia, EthereumSepolia } from '@circle-fin/bridge-kit'
import { ERC20_ABI } from '@/config/abis'
import { Card } from '@/components/common/Card'
import {
  SOURCE_ROUTES,
  TransferSpeed,
  assertRecoveryBindings,
  bridgeFacade,
  bridgeLiquidityPath,
  bridgeSwapPath,
  browserRecoveryStore,
  classifyBridgeError,
  createRecoveryRecord,
  formatUsdc,
  getBridgeE2EScenario,
  normalizeBridgeResult,
  normalizeEstimate,
  parseUsdc,
  recoveryToBridgeResult,
  type BridgeRecoveryRecord,
  type BridgeStepName,
  type BridgeUiState,
  type NormalizedEstimate,
  type SourceChain,
} from '@/features/bridge'
import type { BridgeResult } from '@circle-fin/bridge-kit'

const SOURCE_META = {
  Ethereum_Sepolia: {
    label: 'Ethereum Sepolia',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as const,
    gas: 'ETH',
    duration: 'SDK estimate',
  },
  Base_Sepolia: {
    label: 'Base Sepolia',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
    gas: 'ETH',
    duration: 'SDK estimate',
  },
} satisfies Record<SourceChain, { label: string; usdc: `0x${string}`; gas: string; duration: string }>

const STEP_LABELS: Record<BridgeStepName, string> = {
  approve: 'Approve USDC',
  burn: 'Burn on source',
  fetchAttestation: 'Fetch attestation',
  mint: 'Mint on Arc',
}

function shortAddress(value?: string) {
  return value ? `${value.slice(0, 6)}…${value.slice(-4)}` : 'Not connected'
}

function stateLabel(state: BridgeUiState) {
  return {
    idle: 'Not started',
    'waiting-wallet': 'Waiting for wallet',
    pending: 'Pending',
    success: 'Complete',
    error: 'Failed',
    recoverable: 'Recovery available',
  }[state]
}

function e2eEstimate(source: SourceChain): NormalizedEstimate {
  return {
    amount: '10',
    providerFee: source === 'Ethereum_Sepolia' ? '0.001' : '0.0005',
    forwarderFee: '0.01',
    kitFee: null,
    totalFee: source === 'Ethereum_Sepolia' ? '0.011' : '0.0105',
    destinationAmount: source === 'Ethereum_Sepolia' ? '9.989' : '9.9895',
    duration: source === 'Ethereum_Sepolia' ? '8–20 minutes' : '5–15 minutes',
    gas: [{ name: 'burn', token: 'ETH', blockchain: source, fees: { gas: 120000n, gasPrice: 1n, fee: '120000' } } as never],
  }
}

function mockResult(source: SourceChain, state: 'success' | 'error'): BridgeResult {
  const sdkSource = source === 'Ethereum_Sepolia' ? EthereumSepolia : BaseSepolia
  const steps: BridgeResult['steps'] = [
    { name: 'approve', state: 'success', txHash: `0x${'a'.repeat(64)}`, explorerUrl: 'https://sepolia.etherscan.io/tx/mock-approve' },
    { name: 'burn', state: 'success', txHash: `0x${'b'.repeat(64)}`, explorerUrl: 'https://sepolia.etherscan.io/tx/mock-burn' },
    { name: 'fetchAttestation', state: 'success' },
    state === 'success'
      ? { name: 'mint', state: 'success', txHash: `0x${'c'.repeat(64)}`, explorerUrl: 'https://testnet.arcscan.app/tx/mock-mint', forwarded: true }
      : { name: 'mint', state: 'error', errorMessage: 'Forwarding service confirmation timed out' },
  ]
  return {
    amount: '10', token: 'USDC', state, provider: 'CCTPV2BridgingProvider',
    source: { address: `0x${'1'.repeat(40)}`, chain: sdkSource },
    destination: { address: `0x${'1'.repeat(40)}`, recipientAddress: `0x${'1'.repeat(40)}`, useForwarder: true, chain: ArcTestnet },
    steps,
  }
}

export function BridgePage() {
  const connection = useConnection()
  const scenario = getBridgeE2EScenario()
  const mockConnected = scenario !== null && scenario !== 'disconnected'
  const wallet = mockConnected ? `0x${'1'.repeat(40)}` as `0x${string}` : connection.address
  const isConnected = mockConnected || connection.status === 'connected'
  const [source, setSource] = useState<SourceChain>(scenario === 'base' ? 'Base_Sepolia' : 'Ethereum_Sepolia')
  const route = SOURCE_ROUTES.find((item) => item.chain === source)!
  const meta = SOURCE_META[source]
  const [recipientInput, setRecipient] = useState('')
  const recipient = recipientInput || wallet || ''
  const [amount, setAmount] = useState('')
  const [mode, setMode] = useState<'SLOW' | 'FAST'>('SLOW')
  const [estimate, setEstimate] = useState<NormalizedEstimate | null>(null)
  const [fastEstimate, setFastEstimate] = useState<NormalizedEstimate | null>(null)
  const [fastSupported, setFastSupported] = useState(false)
  const [estimateState, setEstimateState] = useState<'idle' | 'loading' | 'error' | 'success'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [confirming, setConfirming] = useState(false)
  const [result, setResult] = useState<BridgeResult | null>(() => scenario === 'restored' ? mockResult(source, 'error') : null)
  const [recovery, setRecovery] = useState<BridgeRecoveryRecord | null>(() => {
    if (scenario === 'restored') return {} as BridgeRecoveryRecord
    try { return browserRecoveryStore().load() } catch { return null }
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const submitLock = useRef(false)
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain()
  const sourceClient = usePublicClient({ chainId: route.chainId })

  const { data: tokenBalance, isLoading: balanceLoading } = useReadContract({
    address: meta.usdc,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: wallet ? [wallet] : undefined,
    chainId: route.chainId,
    query: { enabled: Boolean(wallet) && !scenario },
  })
  const { data: nativeBalance } = useBalance({ address: wallet, chainId: route.chainId, query: { enabled: Boolean(wallet) && !scenario } })
  const balanceRaw = scenario ? 25_000_000n : (tokenBalance as bigint | undefined)
  let amountRaw = 0n
  try { amountRaw = parseUsdc(amount) } catch { /* invalid amount remains zero */ }
  const wrongNetwork = scenario === 'wrong-network' || (isConnected && connection.chainId !== route.chainId && !scenario)
  const validRecipient = isAddress(recipient)
  const insufficientUsdc = balanceRaw !== undefined && amountRaw > balanceRaw
  const insufficientGas = !scenario && nativeBalance !== undefined && nativeBalance.value === 0n
  const steps = normalizeBridgeResult(result ?? mockResult(source, 'error')).steps.map((step) => result ? step : { ...step, state: 'idle' as const })

  function resetEstimate() {
    setEstimate(null)
    setFastEstimate(null)
    setFastSupported(false)
    setEstimateState('idle')
    setMode('SLOW')
  }

  async function activeProvider(): Promise<EIP1193Provider> {
    if (!connection.connector) throw new Error('Connected wallet does not expose an active connector')
    const provider = await connection.connector.getProvider()
    if (!provider || typeof (provider as EIP1193Provider).request !== 'function') throw new Error('Unsupported wallet provider')
    return provider as EIP1193Provider
  }

  async function estimateBridge() {
    setError(null)
    setEstimateState('loading')
    try {
      if (!isConnected) throw new Error('Connect a browser wallet first')
      if (wrongNetwork) throw new Error(`Switch to ${meta.label} before estimating`)
      if (!validRecipient) throw new Error('Enter a valid Arc recipient address')
      if (amountRaw <= 0n) throw new Error('Enter a USDC amount')
      if (insufficientUsdc) throw new Error('Insufficient source USDC')
      if (insufficientGas) throw new Error(`Insufficient ${meta.gas} for source gas`)
      if (scenario === 'estimate-error') throw new Error('Forwarding Service estimate is temporarily unavailable')
      const provider = scenario ? null : await activeProvider()
      const normalized = scenario ? e2eEstimate(source) : normalizeEstimate(await bridgeFacade.estimate({ provider: provider!, wallet: wallet!, source, recipient, amount, mode: mode === 'FAST' ? TransferSpeed.FAST : TransferSpeed.SLOW }))
      setEstimate(normalized)
      if (scenario) {
        setFastEstimate(e2eEstimate(source))
        setFastSupported(true)
      } else if (mode === 'SLOW') {
        try {
          const fast = normalizeEstimate(await bridgeFacade.estimate({ provider: provider!, wallet: wallet!, source, recipient, amount, mode: TransferSpeed.FAST }))
          setFastEstimate(fast)
          setFastSupported(true)
        } catch {
          setFastEstimate(null)
          setFastSupported(false)
        }
      }
      setEstimateState('success')
    } catch (cause) {
      setEstimateState('error')
      setError(classifyBridgeError(cause).message)
    }
  }

  async function executeBridge() {
    if (!estimate || submitLock.current) return
    submitLock.current = true
    setIsSubmitting(true)
    setConfirming(false)
    setError(null)
    try {
      const transferMode = mode === 'FAST' ? TransferSpeed.FAST : TransferSpeed.SLOW
      const traceId = crypto.randomUUID().split('-').join('').slice(0, 32)
      const persistBurn = (burn: BridgeResult) => {
        if (!wallet) return
        const record = createRecoveryRecord({ wallet, source, recipient, amount, mode, result: burn, traceId })
        browserRecoveryStore().saveAfterBurn(record)
        setRecovery(record)
      }
      const output = scenario ? mockResult(source, scenario === 'recoverable' ? 'error' : 'success') : await bridgeFacade.bridge({ provider: await activeProvider(), wallet: wallet!, source, recipient, amount, mode: transferMode, traceId, onBurn: persistBurn })
      setResult(output)
      const normalized = normalizeBridgeResult(output)
      if (normalized.burnHash && wallet && !recovery) {
        const record = createRecoveryRecord({ wallet, source, recipient, amount, mode, result: output, traceId })
        if (!scenario) browserRecoveryStore().saveAfterBurn(record)
        setRecovery(record)
      }
    } catch (cause) {
      setError(classifyBridgeError(cause).message)
    } finally {
      submitLock.current = false
      setIsSubmitting(false)
    }
  }

  async function recoverBridge() {
    if (!recovery || submitLock.current || !wallet) return
    submitLock.current = true
    setIsSubmitting(true)
    setError(null)
    try {
      if (scenario) { setResult(mockResult(source, 'success')); setRecovery(null); return }
      assertRecoveryBindings(recovery, { wallet, source, recipient })
      if (!sourceClient) throw new Error('Source RPC is unavailable for burn verification')
      const burn = await sourceClient.getTransaction({ hash: recovery.burnHash as `0x${string}` })
      if (!burn) throw new Error('Recorded burn transaction not found on source chain')
      if (burn.from.toLowerCase() !== wallet.toLowerCase()) throw new Error('Recorded burn sender does not match the connected wallet')
      const output = await bridgeFacade.retryBridge(recoveryToBridgeResult(recovery), { provider: await activeProvider(), wallet, source, recipient, amount: recovery.amount, mode: recovery.mode })
      setResult(output)
      if (output.state === 'success') browserRecoveryStore().clear()
    } catch (cause) {
      setError(classifyBridgeError(cause).message)
    } finally {
      submitLock.current = false
      setIsSubmitting(false)
    }
  }

  function dismissRecovery() {
    try { if (!scenario) browserRecoveryStore().clear() } catch { /* storage unavailable */ }
    setRecovery(null)
  }

  const mintStep = result?.steps.find((step) => step.name.toLowerCase() === 'mint')
  const success = result?.state === 'success'

  return (
    <main className="page-fade mx-auto min-h-[calc(100vh-4rem)] max-w-7xl px-3 pb-16 pt-24 sm:px-6 lg:px-8">
      <div className="mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-coco-teal-400/20 bg-coco-teal-400/10 px-3 py-1 text-xs font-medium text-coco-teal-400">
            <ShieldCheck className="h-3.5 w-3.5" /> CCTP V2 · testnet MVP
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-coco-dark-text sm:text-4xl">Bridge USDC to Arc</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-coco-dark-muted">Move native CCTP USDC from Sepolia testnets. Circle Forwarding Service submits the Arc mint and deducts its quoted fee from the destination amount.</p>
        </div>
        <div className="rounded-xl border border-coco-dark-border bg-coco-dark-surface/70 px-3 py-2 text-xs text-coco-dark-muted">
          Connected: <span className="font-mono text-coco-dark-text">{shortAddress(wallet)}</span>
        </div>
      </div>

      {!isConnected && (
        <Card className="mb-5 border-coco-amber-500/25 bg-coco-amber-500/5 p-5">
          <div className="flex gap-3"><WalletCards className="mt-0.5 h-5 w-5 text-coco-amber-500" /><div><h2 className="font-semibold text-coco-dark-text">Connect a browser wallet</h2><p className="mt-1 text-sm text-coco-dark-muted">Use the Connect button above. This page never requests wallet access automatically.</p></div></div>
        </Card>
      )}

      {recovery && isConnected && (
        <div data-testid="recovery-card"><Card className="mb-5 border-coco-amber-500/25 p-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-wider text-coco-amber-500">Recoverable transfer</p><h2 className="mt-1 font-semibold text-coco-dark-text">Burn succeeded; resume attestation or mint</h2><p className="mt-1 text-sm text-coco-dark-muted">Recovery creates fresh wallet adapters and calls retry only. It will not repeat the burn.</p></div>
            <div className="flex gap-2"><button type="button" onClick={() => void recoverBridge()} disabled={isSubmitting} className="min-h-11 rounded-xl bg-coco-amber-500 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50">Resume</button><button type="button" onClick={dismissRecovery} className="min-h-11 rounded-xl border border-coco-dark-border px-4 text-sm text-coco-dark-secondary">Dismiss</button></div>
          </div>
        </Card></div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.15fr)_minmax(20rem,.85fr)]">
        <Card className="p-4 sm:p-6">
          <div className="grid gap-4 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
            <label className="grid gap-2 text-sm font-medium text-coco-dark-secondary">Source
              <select aria-label="Source chain" value={source} onChange={(event) => { setSource(event.target.value as SourceChain); resetEstimate() }} className="min-h-12 rounded-xl border border-coco-dark-border bg-coco-dark-bg px-3 text-coco-dark-text outline-none focus:border-coco-green-500">
                <option value="Ethereum_Sepolia">Ethereum Sepolia</option><option value="Base_Sepolia">Base Sepolia</option>
              </select>
            </label>
            <div className="hidden h-12 items-center sm:flex"><ArrowRight className="h-5 w-5 text-coco-dark-muted" /></div>
            <div className="grid gap-2 text-sm font-medium text-coco-dark-secondary"><span>Destination</span>
              <div className="flex min-h-12 items-center rounded-xl border border-coco-teal-400/20 bg-coco-teal-400/5 px-3 font-medium text-coco-dark-text">Arc Testnet <span className="ml-auto text-xs text-coco-teal-400">Fixed</span></div>
            </div>
          </div>

          {wrongNetwork && (
            <div className="mt-4 flex flex-col gap-3 rounded-xl border border-coco-amber-500/25 bg-coco-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-sm text-coco-amber-500"><AlertTriangle className="h-4 w-4" /> Wallet is on the wrong source network.</p>
              <button type="button" onClick={() => scenario ? undefined : void switchChainAsync({ chainId: route.chainId })} disabled={isSwitching} className="min-h-11 rounded-xl border border-coco-amber-500/30 px-4 text-sm font-semibold text-coco-amber-500">{isSwitching ? 'Switching…' : `Switch to ${meta.label}`}</button>
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <label className="grid gap-2 text-sm font-medium text-coco-dark-secondary">Amount
              <div className="flex min-h-14 items-center rounded-xl border border-coco-dark-border bg-coco-dark-bg px-3 focus-within:border-coco-green-500"><input aria-label="USDC amount" inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); resetEstimate() }} placeholder="0.00" className="min-w-0 flex-1 bg-transparent text-xl text-coco-dark-text outline-none" /><span className="mr-2 text-sm font-semibold text-coco-dark-text">USDC</span><button type="button" onClick={() => { if (balanceRaw !== undefined) { setAmount(formatUsdc(balanceRaw)); resetEstimate() } }} disabled={!balanceRaw} className="rounded-lg bg-coco-green-500/15 px-2 py-1 text-xs font-semibold text-coco-green-500 disabled:opacity-40">Max</button></div>
              <span className="text-xs text-coco-dark-muted">Balance: {balanceLoading ? 'Loading…' : balanceRaw === undefined ? '—' : `${formatUsdc(balanceRaw)} USDC`}</span>
            </label>
            <label className="grid gap-2 text-sm font-medium text-coco-dark-secondary">Recipient on Arc
              <input aria-label="Recipient address" value={recipient} onChange={(event) => { setRecipient(event.target.value); resetEstimate() }} className="min-h-14 min-w-0 rounded-xl border border-coco-dark-border bg-coco-dark-bg px-3 font-mono text-sm text-coco-dark-text outline-none focus:border-coco-green-500" />
              <span className="text-xs text-coco-dark-muted">Defaults to the connected account; no Arc gas required for forwarded mint.</span>
            </label>
          </div>

          <fieldset className="mt-5"><legend className="mb-2 text-sm font-medium text-coco-dark-secondary">Transfer mode</legend><div className="grid grid-cols-2 gap-2"><button type="button" aria-pressed={mode === 'SLOW'} onClick={() => setMode('SLOW')} className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${mode === 'SLOW' ? 'border-coco-green-500 bg-coco-green-500/10 text-coco-dark-text' : 'border-coco-dark-border text-coco-dark-muted'}`}>Standard</button>{fastSupported && <button type="button" aria-pressed={mode === 'FAST'} onClick={() => { setMode('FAST'); if (fastEstimate) setEstimate(fastEstimate) }} className={`min-h-12 rounded-xl border px-3 text-sm font-semibold ${mode === 'FAST' ? 'border-coco-teal-400 bg-coco-teal-400/10 text-coco-dark-text' : 'border-coco-dark-border text-coco-dark-muted'}`}><Zap className="mr-1 inline h-4 w-4" />Fast</button>}</div><p className="mt-2 text-xs text-coco-dark-muted">Fast is shown only after a FAST estimate succeeds for this exact route and amount.</p></fieldset>

          {error && <div role="alert" className="mt-4 rounded-xl border border-coco-red-500/25 bg-coco-red-500/5 p-3 text-sm text-coco-red-500">{error}</div>}

          <button type="button" onClick={() => estimate ? setConfirming(true) : void estimateBridge()} disabled={!isConnected || wrongNetwork || estimateState === 'loading' || !validRecipient || amountRaw <= 0n || insufficientUsdc || insufficientGas || isSubmitting} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-coco-green-500 px-4 font-semibold text-white shadow-lg shadow-coco-green-500/20 transition hover:bg-coco-green-600 disabled:cursor-not-allowed disabled:opacity-45">
            {estimateState === 'loading' ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Estimating…</> : estimate ? 'Review transfer' : 'Estimate bridge'}
          </button>
        </Card>

        <div className="grid content-start gap-5">
          <div data-testid="estimate-panel"><Card className="p-5"><h2 className="font-semibold text-coco-dark-text">Estimate</h2>{estimate ? <dl className="mt-4 grid gap-3 text-sm"><EstimateRow label="Destination amount" value={`${estimate.destinationAmount} USDC`} strong /><EstimateRow label="CCTP protocol fee" value={estimate.providerFee === null ? 'Unavailable' : `${estimate.providerFee} USDC`} /><EstimateRow label="Forwarding Service fee" value={estimate.forwarderFee === null ? 'Unavailable' : `${estimate.forwarderFee} USDC`} /><EstimateRow label="Application fee" value="0 USDC" /><EstimateRow label="Total estimated fee" value={`${estimate.totalFee} USDC`} strong /><EstimateRow label="Estimated duration" value={estimate.duration ?? 'Not provided by Bridge Kit 1.12.1'} icon={<Clock3 className="h-4 w-4" />} /><EstimateRow label="Source gas requirement" value={estimate.gas.map((item) => `${item.name}: ${item.fees?.fee ?? 'unavailable'} ${item.token}`).join(', ') || 'Unavailable'} /></dl> : <p className="mt-3 text-sm leading-6 text-coco-dark-muted">Enter an amount and request an SDK estimate. Submission stays disabled if fees, gas, or forwarding availability cannot be estimated.</p>}</Card></div>

          <Card className="p-5"><h2 className="font-semibold text-coco-dark-text">Bridge lifecycle</h2><ol className="mt-4 grid gap-3">{steps.map((step) => <li key={step.name} className="flex min-w-0 items-center gap-3"><span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${step.state === 'success' ? 'border-coco-green-500/30 bg-coco-green-500/10 text-coco-green-500' : step.state === 'error' || step.state === 'recoverable' ? 'border-coco-amber-500/30 bg-coco-amber-500/10 text-coco-amber-500' : 'border-coco-dark-border text-coco-dark-muted'}`}>{step.state === 'success' ? <Check className="h-4 w-4" /> : step.state === 'pending' || step.state === 'waiting-wallet' ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <span className="text-xs">{steps.indexOf(step) + 1}</span>}</span><div className="min-w-0 flex-1"><p className="text-sm font-medium text-coco-dark-text">{STEP_LABELS[step.name]}</p><p className="text-xs text-coco-dark-muted">{stateLabel(step.state)}</p></div>{step.explorerUrl && <a href={step.explorerUrl} target="_blank" rel="noreferrer" aria-label={`View ${step.name} transaction`} className="text-coco-teal-400"><ExternalLink className="h-4 w-4" /></a>}</li>)}</ol></Card>
        </div>
      </div>

      {confirming && estimate && (
        <div role="dialog" aria-modal="true" aria-labelledby="bridge-confirm-title" className="fixed inset-0 z-[70] grid place-items-end bg-black/65 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"><div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-coco-dark-border bg-coco-dark-surface p-5 shadow-coco-3 sm:max-w-lg sm:rounded-3xl sm:p-6"><h2 id="bridge-confirm-title" className="text-xl font-semibold text-coco-dark-text">Confirm bridge</h2><p className="mt-2 text-sm text-coco-dark-muted">Your wallet will approve and burn USDC on {meta.label}. Circle forwards the mint to Arc Testnet.</p><dl className="mt-5 grid gap-3 text-sm"><EstimateRow label="From" value={meta.label} /><EstimateRow label="To" value="Arc Testnet (chain 5042002)" /><EstimateRow label="Recipient" value={shortAddress(recipient)} /><EstimateRow label="Amount" value={`${amount} USDC`} /><EstimateRow label="Mode" value={mode === 'SLOW' ? 'Standard' : 'Fast'} /><EstimateRow label="Expected mint" value={`${estimate.destinationAmount} USDC`} strong /><EstimateRow label="Total fees" value={`${estimate.totalFee} USDC`} /></dl><div className="mt-5 rounded-xl border border-coco-teal-400/20 bg-coco-teal-400/5 p-3 text-xs leading-5 text-coco-dark-secondary">The Forwarding Service fee is deducted from the destination mint. No direct-mint fallback occurs silently.</div><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setConfirming(false)} className="min-h-12 rounded-xl border border-coco-dark-border text-sm font-semibold text-coco-dark-secondary">Cancel</button><button type="button" onClick={() => void executeBridge()} disabled={isSubmitting} className="min-h-12 rounded-xl bg-coco-green-500 text-sm font-semibold text-white disabled:opacity-50">{isSubmitting ? 'Waiting for wallet…' : 'Confirm & bridge'}</button></div></div></div>
      )}

      {success && (
        <Card className="mt-5 border-coco-green-500/25 p-5"><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-coco-green-500/15 text-coco-green-500"><Check className="h-5 w-5" /></div><div><h2 className="font-semibold text-coco-dark-text">USDC arrived on Arc Testnet</h2><p className="mt-1 text-sm text-coco-dark-muted">Choose a next action. No swap or liquidity transaction runs automatically.</p></div></div><div className="mt-5 grid gap-2 sm:grid-cols-3"><Link to={bridgeSwapPath(estimate?.destinationAmount)} className="flex min-h-11 items-center justify-center rounded-xl bg-coco-green-500 px-3 text-sm font-semibold text-white">Swap USDC to EURC</Link><Link to={bridgeLiquidityPath} className="flex min-h-11 items-center justify-center rounded-xl border border-coco-dark-border px-3 text-sm font-semibold text-coco-dark-text">Add Liquidity</Link>{mintStep?.explorerUrl && <a href={mintStep.explorerUrl} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-coco-dark-border px-3 text-sm font-semibold text-coco-teal-400">View destination tx <ExternalLink className="h-4 w-4" /></a>}</div></Card>
      )}

      <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-coco-dark-muted"><RotateCcw className="h-3.5 w-3.5" /> Testnet-only MVP. No production routes, custom contracts, hooks, application fees, or automatic deployment.</p>
    </main>
  )
}

function EstimateRow({ label, value, strong, icon }: { label: string; value: string; strong?: boolean; icon?: React.ReactNode }) {
  return <div className="flex min-w-0 items-start justify-between gap-4 border-b border-coco-dark-border/70 pb-3 last:border-0 last:pb-0"><dt className="flex items-center gap-1.5 text-coco-dark-muted">{icon}{label}</dt><dd className={`min-w-0 break-words text-right ${strong ? 'font-semibold text-coco-dark-text' : 'text-coco-dark-secondary'}`}>{value}</dd></div>
}
