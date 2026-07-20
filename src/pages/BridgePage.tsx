import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, Check, Clock3, Copy, ExternalLink, LoaderCircle, ShieldCheck, WalletCards, Zap } from 'lucide-react'
import { useBalance, useConnection, usePublicClient, useReadContract, useSwitchChain } from 'wagmi'
import { type Hash, isAddress, type EIP1193Provider } from 'viem'
import { ArcTestnet, BaseSepolia, EthereumSepolia, type BridgeKit, type BridgeResult } from '@circle-fin/bridge-kit'
import { ERC20_ABI } from '@/config/abis'
import { Card } from '@/components/common/Card'
import {
  SOURCE_ROUTES,
  TransferSpeed,
  applyPoll,
  applyReceiptReverted,
  applyReceiptSuccess,
  applyReceiptUnknown,
  applyRetryableError,
  applySnapshot,
  applyTerminalError,
  applyTxHash,
  assertRecoveryBindings,
  bridgeFacade,
  bridgeLiquidityPath,
  bridgeSwapPath,
  browserAttemptStore,
  classifyBridgeError,
  createBridgeAttempt,
  type BridgeAttempt,
  type LifecycleStep,
  type LifecycleStepName,
  LIFECYCLE_STEP_LABELS,
  recoveryToBridgeResult,
  resumeAfterBurn,
  subscribeBridgeEvents,
  type SourceChain,
  arcExplorerTxUrl,
  sourceExplorerTxUrl,
  CCTP_SOURCE_DOMAINS,
  pollAttestation,
  type BridgeRecoveryRecord,
  formatUsdc,
  getBridgeE2EScenario,
  normalizeEstimate,
  parseUsdc,
} from '@/features/bridge'
import type { NormalizedEstimate } from '@/features/bridge'

const SOURCE_META = {
  Ethereum_Sepolia: {
    label: 'Ethereum Sepolia',
    usdc: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238' as const,
    gas: 'ETH',
    explorerTx: (h: string) => sourceExplorerTxUrl('Ethereum_Sepolia', h),
  },
  Base_Sepolia: {
    label: 'Base Sepolia',
    usdc: '0x036CbD53842c5426634e7929541eC2318f3dCF7e' as const,
    gas: 'ETH',
    explorerTx: (h: string) => sourceExplorerTxUrl('Base_Sepolia', h),
  },
} satisfies Record<SourceChain, { label: string; usdc: `0x${string}`; gas: string; explorerTx: (h: string) => string }>

const STEP_ORDER: LifecycleStepName[] = ['approve', 'burn', 'attestation', 'forwarded-mint']

function makeTraceId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID().replace(/-/g, '').slice(0, 32)
  }
  return `t_${Date.now()}_${Math.random().toString(16).slice(2)}`
}

function stepLabel(name: LifecycleStepName): string {
  return LIFECYCLE_STEP_LABELS[name]
}

function stepStatusText(step: LifecycleStep, source: SourceChain): string {
  const chain = source === 'Ethereum_Sepolia' ? 'Ethereum Sepolia' : 'Base Sepolia'
  switch (step.state) {
    case 'not-started': return 'Not started'
    case 'awaiting-wallet': return 'Awaiting wallet'
    case 'submitted': return 'Submitted'
    case 'confirming': return step.name === 'burn' ? `Confirming on ${chain}` : 'Confirming'
    case 'waiting': return step.name === 'attestation' ? 'Waiting for Circle' : step.name === 'forwarded-mint' ? 'Forwarding Service processing' : 'Waiting'
    case 'success': return 'Complete'
    case 'noop': return 'Not required'
    case 'skipped': return 'Skipped'
    case 'retryable-error': return step.sanitizedMessage ?? 'Retryable error'
    case 'terminal-error': return step.sanitizedMessage ?? 'Failed'
    case 'unknown-checking': return step.sanitizedMessage ?? 'Status temporarily unknown'
    default: return 'Unknown'
  }
}

function shortHash(value?: string): string {
  return value ? `${value.slice(0, 10)}…${value.slice(-6)}` : ''
}

function e2eEstimate(source: SourceChain): NormalizedEstimate {
  return {
    amount: '10',
    providerFee: null,
    forwarderFee: '0.01',
    kitFee: null,
    totalFee: '0.01',
    destinationAmount: '9.99',
    duration: source === 'Ethereum_Sepolia' ? '8–20 minutes' : '5–15 minutes',
    gas: [{ name: 'burn', token: 'ETH', blockchain: source, fees: { gas: 120000n, gasPrice: 1n, fee: '120000' } } as never],
    warnings: ['CCTP protocol fee: 0 USDC — Standard transfer'],
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

function mockPendingResult(source: SourceChain, pending: LifecycleStepName): BridgeResult {
  const result = mockResult(source, 'success')
  const pendingIndex = STEP_ORDER.indexOf(pending)
  return {
    ...result,
    state: 'pending',
    steps: result.steps.slice(0, pendingIndex + 1).map((step, index) => (index === pendingIndex ? { name: step.name, state: 'pending' } : step)),
  }
}

const POLL_INTERVAL_MS = 12_000
const POLL_MAX_ATTEMPTS = 60 // ~12 min bounded

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
  const [attempts, setAttempts] = useState<BridgeAttempt[]>(() => {
    try { return browserAttemptStore().loadAll() } catch { return [] }
  })
  const [activeAttempt, setActiveAttempt] = useState<BridgeAttempt | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [checkingStatus, setCheckingStatus] = useState(false)
  const submitLock = useRef(false)
  const dialogRef = useRef<HTMLDivElement>(null)
  const dialogOpenerRef = useRef<HTMLElement | null>(null)

  // Focus trap for the confirmation dialog: focus Cancel on open, restore the
  // opener on close, cycle Tab within the dialog, and close on Escape.
  useEffect(() => {
    if (!confirming || !estimate) return
    const dialog = dialogRef.current
    if (!dialog) return
    dialogOpenerRef.current = (document.activeElement as HTMLElement) ?? null
    const focusables = () => Array.from(dialog.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"]):not([disabled])')) as HTMLElement[]
    const cancel = focusables()[0] ?? dialog
    cancel.focus()
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setConfirming(false)
        return
      }
      if (event.key !== 'Tab') return
      const items = focusables()
      if (items.length === 0) return
      const first = items[0]!
      const last = items[items.length - 1]!
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }
    dialog.addEventListener('keydown', onKeyDown)
    return () => {
      dialog.removeEventListener('keydown', onKeyDown)
      dialogOpenerRef.current?.focus?.()
    }
  }, [confirming, estimate])
  const pollAbort = useRef<AbortController | null>(null)
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
  const { data: nativeBalance, isLoading: nativeBalanceLoading } = useBalance({ address: wallet, chainId: route.chainId, query: { enabled: Boolean(wallet) && !scenario } })
  const balanceRaw = scenario === 'balance-loading' ? undefined : scenario === 'insufficient-usdc' ? 1_000_000n : scenario ? 25_000_000n : (tokenBalance as bigint | undefined)
  let amountRaw = 0n
  try { amountRaw = parseUsdc(amount) } catch { /* invalid amount remains zero */ }
  const wrongNetwork = scenario === 'wrong-network' || (isConnected && connection.chainId !== route.chainId && !scenario)
  const validRecipient = isAddress(recipient)
  const showRecipientError = recipientInput.length > 0 && !validRecipient
  const showAmountError = amount.length > 0 && amountRaw <= 0n
  const insufficientUsdc = balanceRaw !== undefined && amountRaw > balanceRaw
  const insufficientGas = scenario === 'insufficient-gas' || (!scenario && nativeBalance !== undefined && nativeBalance.value === 0n)
  const sourceBalancesLoading = scenario === 'balance-loading' || (!scenario && isConnected && (balanceLoading || nativeBalanceLoading || balanceRaw === undefined || nativeBalance === undefined))

  const persist = useCallback((attempt: BridgeAttempt) => {
    setActiveAttempt(attempt)
    setAttempts((prev) => {
      const next = prev.filter((a) => a.id !== attempt.id)
      return [...next, attempt].slice(-10)
    })
    try { browserAttemptStore().save(attempt) } catch { /* storage unavailable */ }
  }, [])

  function resetEstimate() {
    setEstimate(null)
    setFastEstimate(null)
    setFastSupported(false)
    setEstimateState('idle')
    setMode('SLOW')
  }

  const activeStep = activeAttempt ? activeAttempt.steps[activeAttempt.activeStep ?? 'burn'] : undefined
  const lifecycleStatusText = activeAttempt && activeStep
    ? `${stepLabel(activeStep.name)}: ${stepStatusText(activeStep, source)}`
    : ''

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
      if (sourceBalancesLoading) throw new Error('Source balances are still loading')
      if (insufficientUsdc) throw new Error('Insufficient source USDC')
      if (insufficientGas) throw new Error(`Insufficient ${meta.gas} for source gas`)
      if (scenario === 'estimate-error') throw new Error('Forwarding Service estimate is temporarily unavailable')
      if (scenario === 'long-error') throw new Error('Bridge estimate failed because the source RPC provider returned a response that could not be validated. Reconnect the active wallet, confirm Ethereum Sepolia is selected, and try again without changing the recipient or submitting a transaction.')
      const provider = scenario ? null : await activeProvider()
      const normalized = scenario ? e2eEstimate(source) : normalizeEstimate(await bridgeFacade.estimate({ provider: provider!, wallet: wallet!, source, recipient, amount, mode: mode === 'FAST' ? TransferSpeed.FAST : TransferSpeed.SLOW }), mode)
      setEstimate(normalized)
      if (scenario) {
        setFastEstimate(e2eEstimate(source))
        setFastSupported(true)
      } else if (mode === 'SLOW') {
        try {
          const fast = normalizeEstimate(await bridgeFacade.estimate({ provider: provider!, wallet: wallet!, source, recipient, amount, mode: TransferSpeed.FAST }), 'FAST')
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
    const matching = attempts.find((a) =>
      a.account.toLowerCase() === (wallet ?? '').toLowerCase()
      && a.sourceChain === source
      && a.recipient.toLowerCase() === recipient.toLowerCase()
      && a.amount === (() => { try { return parseUsdc(amount).toString() } catch { return '' } })()
      && a.transferSpeed === mode
      && a.useForwarder
      && !['complete', 'terminal-error'].includes(a.overallState))
    if (matching) {
      setError('A matching bridge transfer is already in progress.')
      setActiveAttempt(matching)
      return
    }
    submitLock.current = true
    setIsSubmitting(true)
    setConfirming(false)
    setError(null)
    const traceId = makeTraceId()
    const attempt = createBridgeAttempt({
      account: wallet!,
      source,
      sourceChainId: route.chainId,
      sourceDomain: CCTP_SOURCE_DOMAINS[source],
      recipient,
      amount: parseUsdc(amount).toString(),
      transferSpeed: mode,
      useForwarder: true,
      traceId,
      estimateSnapshot: estimate,
    })
    attempt.overallState = 'awaiting-confirmation'
    persist(attempt)

    let unsubscribe: (() => void) | undefined
    const kit: BridgeKit = bridgeFacade['kit' as keyof typeof bridgeFacade] as unknown as BridgeKit
    try {
      const provider = scenario ? null : await activeProvider()
      const input = { provider: provider!, wallet: wallet!, source, recipient, amount, mode: mode === 'FAST' ? TransferSpeed.FAST : TransferSpeed.SLOW, traceId }
      if (scenario) {
        const result = scenario === 'recoverable' ? mockResult(source, 'error') : scenario === 'duplicate' ? mockPendingResult(source, 'burn') : mockResult(source, 'success')
        const built = applySnapshot(attempt, result)
        persist(built)
        return
      }
      // Subscribe to real SDK events BEFORE invoking bridge().
      if (kit && typeof kit.on === 'function') {
        unsubscribe = subscribeBridgeEvents(kit, attempt.id, traceId, {
          onEvent: (info) => {
            if (info.stepName && info.txHash) {
              persist(applyTxHash(attemptRef.current ?? attempt, info.stepName, info.txHash, info.explorerUrl))
            }
          },
        })
      }
      const attemptRef = { current: attempt }
      const output = await bridgeFacade.bridge({ ...input, onBurn: (burn) => {
        const built = applySnapshot(attemptRef.current, burn)
        attemptRef.current = built
        persist(built)
      } })
      const built = applySnapshot(attemptRef.current, output)
      attemptRef.current = built
      persist(built)
      // Begin receipt verification + Iris polling.
      void verifyAndPoll(built)
    } catch (cause) {
      const safe = classifyBridgeError(cause)
      if (activeAttempt) {
        const burnStep = activeAttempt.steps.burn
        if (burnStep.txHash && safe.category === 'network') {
          persist(applyReceiptUnknown(activeAttempt, 'burn'))
        } else {
          persist(applyTerminalError(activeAttempt, 'burn', safe.message))
        }
      }
      setError(safe.message)
    } finally {
      unsubscribe?.()
      submitLock.current = false
      setIsSubmitting(false)
    }
  }

  const attemptRef = useRef<BridgeAttempt | null>(null)
  useEffect(() => { attemptRef.current = activeAttempt }, [activeAttempt])

  async function verifyAndPoll(attempt: BridgeAttempt) {
    const burnHash = attempt.steps.burn.txHash
    if (!burnHash || !sourceClient) { void startPolling(attempt); return }
    try {
      const receipt = await sourceClient.getTransactionReceipt({ hash: burnHash as Hash })
      if (receipt) {
        if (receipt.status === 'success') {
          const next = applyReceiptSuccess(attempt, 'burn')
          persist(next)
          void startPolling(next)
          return
        }
        const next = applyReceiptReverted(attempt, 'burn')
        persist(next)
        return
      }
      const next = applyReceiptUnknown(attempt, 'burn')
      persist(next)
    } catch {
      const next = applyReceiptUnknown(attempt, 'burn')
      persist(next)
    }
    void startPolling(attempt)
  }

  async function startPolling(attempt: BridgeAttempt) {
    const burnHash = attempt.steps.burn.txHash
    if (!burnHash) return
    pollAbort.current?.abort()
    const controller = new AbortController()
    pollAbort.current = controller
    let attemptsLeft = POLL_MAX_ATTEMPTS
    while (attemptsLeft-- > 0 && !controller.signal.aborted) {
      try {
        const poll = await pollAttestation(CCTP_SOURCE_DOMAINS[source], burnHash, controller.signal)
        const updated = applyPoll(attemptRef.current ?? attempt, poll)
        attemptRef.current = updated
        persist(updated)
        if (poll.status === 'complete') return
      } catch (cause) {
        if (controller.signal.aborted) return
        const safe = classifyBridgeError(cause)
        if (attemptRef.current) persist(applyRetryableError(attemptRef.current, 'attestation', safe.message))
      }
      try { await new Promise((resolve, reject) => { const t = setTimeout(resolve, POLL_INTERVAL_MS); controller.signal.addEventListener('abort', () => { clearTimeout(t); reject(new DOMException('aborted', 'AbortError')) }, { once: true }) }) } catch { return }
    }
  }

  function stopPolling() {
    pollAbort.current?.abort()
    pollAbort.current = null
  }

  async function recoverBridge() {
    if (!activeAttempt || submitLock.current || !wallet) return
    submitLock.current = true
    setIsSubmitting(true)
    setError(null)
    try {
      if (scenario) { persist({ ...activeAttempt, overallState: 'complete' }); setActiveAttempt({ ...activeAttempt, overallState: 'complete' }); return }
      assertRecoveryBindings(activeAttempt as unknown as BridgeRecoveryRecord, { wallet, source, recipient })
      if (!sourceClient) throw new Error('Source RPC is unavailable for burn verification')
      const burn = await sourceClient.getTransaction({ hash: activeAttempt.steps.burn.txHash as Hash })
      if (!burn) throw new Error('Recorded burn transaction not found on source chain')
      if (burn.from.toLowerCase() !== wallet.toLowerCase()) throw new Error('Recorded burn sender does not match the connected wallet')
      const resumed = resumeAfterBurn(activeAttempt)
      persist(resumed)
      const output = await bridgeFacade.retryBridge(recoveryToBridgeResult(activeAttempt as unknown as BridgeRecoveryRecord), { provider: await activeProvider(), wallet, source, recipient, amount: activeAttempt.amount, mode: activeAttempt.transferSpeed })
      const built = applySnapshot(resumed, output)
      persist(built)
      if (built.overallState === 'complete') { try { browserAttemptStore().remove(built.id) } catch { /* ignore */ } }
    } catch (cause) {
      setError(classifyBridgeError(cause).message)
    } finally {
      submitLock.current = false
      setIsSubmitting(false)
    }
  }

  // Recover an existing transfer by burn hash (manual owner flow).
  const [recoverOpen, setRecoverOpen] = useState(false)
  const [recoverSource, setRecoverSource] = useState<SourceChain>('Ethereum_Sepolia')
  const [recoverHash, setRecoverHash] = useState('')
  const [recoverError, setRecoverError] = useState<string | null>(null)

  async function submitRecoverByHash() {
    setRecoverError(null)
    if (!/^0x[a-fA-F0-9]{64}$/.test(recoverHash)) { setRecoverError('Enter a valid 32-byte burn transaction hash.'); return }
    // Mocked e2e path: no live RPC call.
    if (scenario === 'recover-success') {
      const attempt = createBridgeAttempt({ account: wallet!, source: recoverSource, sourceChainId: SOURCE_ROUTES.find((r) => r.chain === recoverSource)!.chainId, sourceDomain: CCTP_SOURCE_DOMAINS[recoverSource], recipient: wallet!, amount: '1', transferSpeed: 'SLOW', useForwarder: true })
      attempt.steps.burn = { name: 'burn', state: 'success', txHash: recoverHash, explorerUrl: sourceExplorerTxUrl(recoverSource, recoverHash), receiptStatus: 'success', confirmedAt: Date.now() }
      attempt.steps.attestation = { name: 'attestation', state: 'success', completedAt: Date.now() }
      attempt.steps['forwarded-mint'] = { name: 'forwarded-mint', state: 'success', txHash: '0xbeef', explorerUrl: arcExplorerTxUrl('0xbeef'), forwarded: true, completedAt: Date.now() }
      attempt.overallState = 'complete'
      persist(attempt)
      setActiveAttempt(attempt)
      setRecoverOpen(false)
      setRecoverHash('')
      return
    }
    if (!sourceClient) { setRecoverError('Source RPC is unavailable.'); return }
    try {
      const burn = await sourceClient.getTransaction({ hash: recoverHash as Hash })
      if (!burn) throw new Error('Transaction not found on the selected source chain.')
      const receipt = await sourceClient.getTransactionReceipt({ hash: recoverHash as Hash })
      if (!receipt || receipt.status !== 'success') throw new Error('Source burn receipt is missing or reverted.')
      const attempt = createBridgeAttempt({
        account: wallet!,
        source: recoverSource,
        sourceChainId: SOURCE_ROUTES.find((r) => r.chain === recoverSource)!.chainId,
        sourceDomain: CCTP_SOURCE_DOMAINS[recoverSource],
        recipient: wallet!,
        amount: '0',
        transferSpeed: 'SLOW',
        useForwarder: true,
      })
      attempt.steps.burn = { name: 'burn', state: 'success', txHash: recoverHash, explorerUrl: sourceExplorerTxUrl(recoverSource, recoverHash), receiptStatus: 'success', confirmedAt: Date.now() }
      attempt.steps.attestation = { name: 'attestation', state: 'waiting', sanitizedMessage: 'Resuming attestation polling' }
      attempt.overallState = 'waiting-attestation'
      persist(attempt)
      setActiveAttempt(attempt)
      setRecoverOpen(false)
      setRecoverHash('')
      void startPolling(attempt)
    } catch (cause) {
      setRecoverError(classifyBridgeError(cause).message)
    }
  }

  function dismissAttempt(id: string) {
    try { browserAttemptStore().remove(id) } catch { /* ignore */ }
    setAttempts((prev) => prev.filter((a) => a.id !== id))
    if (activeAttempt?.id === id) setActiveAttempt(null)
  }

  function attemptFromResult(result: BridgeResult, acc: string, src: SourceChain, rec: string, amt: string, spd: 'SLOW' | 'FAST'): BridgeAttempt {
    const base = createBridgeAttempt({ account: acc, source: src, sourceChainId: SOURCE_ROUTES.find((r) => r.chain === src)!.chainId, sourceDomain: CCTP_SOURCE_DOMAINS[src], recipient: rec, amount: amt, transferSpeed: spd, useForwarder: true })
    return applySnapshot(base, result)
  }

  useEffect(() => () => stopPolling(), [])

  // Reload restoration: bring the latest incomplete persisted attempt back into
  // the active lifecycle view and resume attestation/forwarding polling. This
  // must NOT request a wallet signature and must NOT repeat approval or burn.
  // Seed an attempt for mocked e2e scenarios (no live transaction).
  // Only display scenarios are seeded; `duplicate` must start empty so the
  // submission lock can be exercised against a fresh submit.
  useEffect(() => {
    if (!scenario) return
    if (scenario === 'duplicate') return
    const r = scenario === 'restored' || scenario === 'recoverable'
      ? mockResult(source, scenario === 'recoverable' ? 'error' : 'success')
      : (() => {
          const pending = scenario.replace('pending-', '')
          return mockPendingResult(source, pending as LifecycleStepName)
        })()
    const seeded = attemptFromResult(r, wallet ?? '', source, recipient, '10', 'SLOW')
    // Defer to a microtask to satisfy set-state-in-effect rules.
    queueMicrotask(() => persist(seeded))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (scenario) return
    if (activeAttempt) return
    try {
      const all = browserAttemptStore().loadAll()
      const incomplete = all.filter((a) => !['complete', 'terminal-error'].includes(a.overallState))
      const latest = incomplete.sort((x, y) => y.updatedAt - x.updatedAt)[0]
      if (!latest) return
      // Defer state updates to a microtask to avoid cascading renders during mount.
      queueMicrotask(() => {
        setActiveAttempt(latest)
        setAttempts(all)
      })
      if (latest.steps.burn.txHash) {
        // Resume status checks only; never re-submit a transaction.
        void (async () => {
          const client = sourceClient
          if (!client) return
          try {
            const receipt = await client.getTransactionReceipt({ hash: latest.steps.burn.txHash as Hash })
            if (receipt?.status === 'success') persist(applyReceiptSuccess(latest, 'burn'))
            else if (receipt && String(receipt.status) !== 'success') persist(applyReceiptReverted(latest, 'burn'))
            else persist(applyReceiptUnknown(latest, 'burn'))
          } catch {
            persist(applyReceiptUnknown(latest, 'burn'))
          }
          void startPolling(attemptRef.current ?? latest)
        })()
      }
    } catch { /* storage unavailable */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ---- Rendering helpers ----
  function CopyButton({ value, label }: { value: string; label: string }) {
    const [copied, setCopied] = useState(false)
    return (
      <button type="button" onClick={() => { navigator.clipboard?.writeText(value).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }).catch(() => {}) }} aria-label={`Copy ${label}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-coco-teal-400 hover:bg-coco-teal-400/10 focus-visible:ring-2 focus-visible:ring-coco-teal-400/40">
        <Copy className="h-3.5 w-3.5" />
        <span className="sr-only">{copied ? 'Copied' : 'Copy'} {label}</span>
      </button>
    )
  }

  function StepRow({ step }: { step: LifecycleStep }) {
    const stateColor = step.state === 'success' ? 'border-coco-green-500/30 bg-coco-green-500/10 text-coco-green-500'
      : step.state === 'retryable-error' || step.state === 'unknown-checking' ? 'border-coco-amber-500/30 bg-coco-amber-500/10 text-coco-amber-500'
      : step.state === 'terminal-error' ? 'border-coco-red-500/30 bg-coco-red-500/10 text-coco-red-500'
      : 'border-coco-dark-border text-coco-dark-muted'
    const icon = step.state === 'success' ? <Check className="h-4 w-4" />
      : step.state === 'submitted' || step.state === 'confirming' || step.state === 'waiting' || step.state === 'unknown-checking' || step.state === 'awaiting-wallet' ? <LoaderCircle className="h-4 w-4 animate-spin" />
      : <span className="text-xs">{STEP_ORDER.indexOf(step.name) + 1}</span>
    const explorerUrl = step.explorerUrl ?? (step.txHash ? (step.name === 'forwarded-mint' ? arcExplorerTxUrl(step.txHash) : meta.explorerTx(step.txHash)) : undefined)
    return (
      <li className="flex min-w-0 items-start gap-3">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border ${stateColor}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="break-words text-sm font-medium text-coco-dark-text">{stepLabel(step.name)}</p>
          <p className="break-words text-sm text-coco-dark-muted">{stepStatusText(step, source)}</p>
          {step.txHash && (
            <div className="mt-1 flex min-w-0 items-center gap-1">
              <code className="min-w-0 overflow-x-auto whitespace-nowrap rounded bg-coco-dark-bg px-1.5 py-0.5 font-mono text-xs text-coco-dark-secondary" title={step.txHash} aria-label={`${stepLabel(step.name)} transaction hash ${step.txHash}`}>{shortHash(step.txHash)}</code>
              <CopyButton value={step.txHash} label={`${stepLabel(step.name)} hash`} />
              {explorerUrl && <a href={explorerUrl} target="_blank" rel="noreferrer" aria-label={`View ${stepLabel(step.name)} transaction`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-coco-teal-400 hover:bg-coco-teal-400/10 focus-visible:ring-2 focus-visible:ring-coco-teal-400/40"><ExternalLink className="h-3.5 w-3.5" /></a>}
            </div>
          )}
        </div>
      </li>
    )
  }

  const showHistory = attempts.length > 0 && activeAttempt ? attempts.filter((a) => a.id !== activeAttempt!.id).length > 0 : attempts.length > 1

  return (
    <main className="page-fade mx-auto min-h-[calc(100vh-4rem)] w-full max-w-[1400px] px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-24 sm:px-6 xl:px-8">
      <div data-testid="bridge-page-content" inert={confirming && estimate ? true : undefined} className="contents">
        <div className="mb-6 flex min-w-0 flex-col gap-4 sm:mb-7 sm:flex-row sm:items-end sm:justify-between">
          <div className="min-w-0">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-coco-teal-400/20 bg-coco-teal-400/10 px-3 py-1 text-xs font-medium text-coco-teal-400">
              <ShieldCheck className="h-3.5 w-3.5" /> CCTP V2 · testnet MVP
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-coco-dark-text sm:text-4xl">Bridge USDC to Arc</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-coco-dark-muted">Move native CCTP USDC from Sepolia testnets. Circle Forwarding Service submits the Arc mint and deducts its quoted fee from the destination amount.</p>
          </div>
          <div className="min-w-0 max-w-full self-start rounded-xl border border-coco-dark-border bg-coco-dark-surface/70 px-3 py-2 text-sm text-coco-dark-muted sm:shrink-0 sm:self-auto">
            Connected: <span className="font-mono text-coco-dark-text">{shortHash(wallet)}</span>
          </div>
        </div>

        {!isConnected && (
          <Card className="mb-5 border-coco-amber-500/25 bg-coco-amber-500/5 p-5">
            <div className="flex gap-3"><WalletCards className="mt-0.5 h-5 w-5 text-coco-amber-500" /><div><h2 className="font-semibold text-coco-dark-text">Connect a browser wallet</h2><p className="mt-1 text-sm text-coco-dark-muted">Use the Connect button above. This page never requests wallet access automatically.</p></div></div>
          </Card>
        )}

        {activeAttempt && ['retryable-error', 'unknown-checking'].includes(activeAttempt.overallState) && (
          <div data-testid="recovery-card" className="min-w-0"><Card className="mb-5 min-w-0 border-coco-amber-500/25 p-4 sm:p-5">
            <div className="flex min-w-0 flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wider text-coco-amber-500">Recoverable transfer</p><h2 className="mt-1 font-semibold text-coco-dark-text">Burn succeeded; resume attestation or mint</h2><p className="mt-1 break-words text-sm leading-6 text-coco-dark-muted">Recovery creates fresh wallet adapters and calls retry only. It will not repeat the burn.</p></div>
              <div className="grid w-full shrink-0 grid-cols-1 gap-2 min-[420px]:grid-cols-2 md:w-auto"><button type="button" onClick={() => void recoverBridge()} disabled={isSubmitting} className="min-h-11 rounded-xl bg-coco-amber-500 px-4 text-sm font-semibold text-slate-950 disabled:opacity-50">Resume</button><button type="button" onClick={() => dismissAttempt(activeAttempt.id)} className="min-h-11 rounded-xl border border-coco-dark-border px-4 text-sm text-coco-secondary">Dismiss</button></div>
            </div>
          </Card></div>
        )}

        <div data-testid="bridge-layout" className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,25rem)] xl:items-start">
          <Card className="min-w-0 overflow-hidden p-4 sm:p-6">
            <div className="grid min-w-0 gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] md:items-end md:gap-4">
              <label className="grid min-w-0 gap-2 text-sm font-medium text-coco-dark-secondary">Source
                <select aria-label="Source chain" value={source} onChange={(event) => { setSource(event.target.value as SourceChain); resetEstimate() }} className="min-h-12 w-full min-w-0 rounded-xl border border-coco-dark-border bg-coco-dark-bg px-3 text-coco-dark-text outline-none focus-visible:border-coco-green-500 focus-visible:ring-2 focus-visible:ring-coco-green-500/30">
                  <option value="Ethereum_Sepolia">Ethereum Sepolia</option><option value="Base_Sepolia">Base Sepolia</option>
                </select>
              </label>
              <div aria-hidden="true" className="flex h-5 items-center justify-center md:h-12"><ArrowRight className="h-5 w-5 rotate-90 text-coco-dark-muted md:rotate-0" /></div>
              <div className="grid min-w-0 gap-2 text-sm font-medium text-coco-dark-secondary"><span>Destination</span>
                <div data-testid="bridge-destination" className="flex min-h-12 min-w-0 items-center rounded-xl border border-coco-teal-400/20 bg-coco-teal-400/5 px-3 font-medium text-coco-dark-text">Arc Testnet <span className="ml-auto shrink-0 text-xs text-coco-teal-400">Fixed</span></div>
              </div>
            </div>

            {wrongNetwork && (
              <div className="mt-4 flex min-w-0 flex-col gap-3 rounded-xl border border-coco-amber-500/25 bg-coco-amber-500/5 p-4 sm:flex-row sm:items-center sm:justify-between">
                <p className="flex min-w-0 items-start gap-2 break-words text-sm leading-6 text-coco-amber-500"><AlertTriangle className="mt-1 h-4 w-4 shrink-0" /> Wallet is on the wrong source network.</p>
                <button type="button" onClick={() => scenario ? undefined : void switchChainAsync({ chainId: route.chainId })} disabled={isSwitching} className="min-h-11 w-full shrink-0 rounded-xl border border-coco-amber-500/30 px-4 text-sm font-semibold text-coco-amber-500 sm:w-auto">{isSwitching ? 'Switching…' : `Switch to ${meta.label}`}</button>
              </div>
            )}

            <div data-testid="bridge-fields" className="mt-5 grid min-w-0 gap-5 md:grid-cols-[minmax(13rem,0.7fr)_minmax(0,1.3fr)] md:items-start">
              <div className="grid min-w-0 gap-2">
                <label htmlFor="bridge-amount" className="text-sm font-medium text-coco-dark-secondary">Amount</label>
                <div className="grid min-h-14 min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl border border-coco-dark-border bg-coco-dark-bg px-3 focus-within:border-coco-green-500 focus-within:ring-2 focus-within:ring-coco-green-500/30"><input id="bridge-amount" aria-describedby={`bridge-amount-help${showAmountError ? ' bridge-amount-error' : ''}`} aria-invalid={showAmountError || undefined} aria-label="USDC amount" inputMode="decimal" value={amount} onChange={(event) => { setAmount(event.target.value); resetEstimate() }} placeholder="0.00" className="w-full min-w-0 bg-transparent text-xl text-coco-dark-text outline-none" /><span className="text-sm font-semibold text-coco-dark-text">USDC</span><button type="button" onClick={() => { if (balanceRaw !== undefined) { setAmount(formatUsdc(balanceRaw)); resetEstimate() } }} disabled={!balanceRaw} className="min-h-11 min-w-11 rounded-lg bg-coco-green-500/15 px-2 text-sm font-semibold text-coco-green-500 disabled:opacity-40">Max</button></div>
                <p id="bridge-amount-help" className="text-sm leading-5 text-coco-dark-muted">Balance: {balanceLoading || scenario === 'balance-loading' ? 'Loading…' : balanceRaw === undefined ? '—' : `${formatUsdc(balanceRaw)} USDC`}</p>
                {showAmountError && <p id="bridge-amount-error" className="break-words text-sm leading-5 text-coco-red-500">Enter a valid USDC amount.</p>}
              </div>
              <div className="grid min-w-0 gap-2">
                <label htmlFor="bridge-recipient" className="text-sm font-medium text-coco-dark-secondary">Recipient on Arc</label>
                <input id="bridge-recipient" aria-describedby={`bridge-recipient-help${showRecipientError ? ' bridge-recipient-error' : ''}`} aria-invalid={showRecipientError || undefined} value={recipient} onChange={(event) => { setRecipient(event.target.value); resetEstimate() }} autoComplete="off" spellCheck={false} className="min-h-14 w-full min-w-0 max-w-full overflow-x-auto whitespace-nowrap rounded-xl border border-coco-dark-border bg-coco-dark-bg px-3 font-mono text-sm text-coco-dark-text outline-none focus-visible:border-coco-green-500 focus-visible:ring-2 focus-visible:ring-coco-green-500/30 aria-[invalid=true]:border-coco-red-500" />
                <p id="bridge-recipient-help" className="break-words text-sm leading-5 text-coco-dark-muted">Defaults to the connected account. Circle Forwarding Service mints on Arc; no Arc gas required.</p>
                {showRecipientError && <p id="bridge-recipient-error" className="break-words text-sm leading-5 text-coco-red-500">Enter a valid Arc recipient address.</p>}
              </div>
            </div>

            <fieldset className="mt-5 min-w-0"><legend className="mb-2 text-sm font-medium text-coco-dark-secondary">Transfer mode</legend><div className="grid min-w-0 grid-cols-1 gap-2 min-[360px]:grid-cols-2"><button type="button" aria-pressed={mode === 'SLOW'} data-testid="transfer-mode-standard" onClick={() => setMode('SLOW')} className={`min-h-12 w-full rounded-xl border px-3 text-sm font-semibold ${mode === 'SLOW' ? 'border-coco-green-500 bg-coco-green-500/10 text-coco-dark-text' : 'border-coco-dark-border text-coco-dark-muted'}`}>Standard</button>{fastSupported && <button type="button" aria-pressed={mode === 'FAST'} data-testid="fast-mode-control" onClick={() => { setMode('FAST'); if (fastEstimate) setEstimate(fastEstimate) }} className={`min-h-12 w-full rounded-xl border px-3 text-sm font-semibold ${mode === 'FAST' ? 'border-coco-teal-400 bg-coco-teal-400/10 text-coco-dark-text' : 'border-coco-dark-border text-coco-dark-muted'}`}><Zap className="mr-1 inline h-4 w-4" />Fast</button>}</div><p className="mt-2 break-words text-sm leading-5 text-coco-dark-muted">Fast is shown only after a FAST estimate succeeds for this exact route and amount.</p></fieldset>

            <button type="button" onClick={() => setRecoverOpen((v) => !v)} className="mt-4 text-xs font-medium text-coco-teal-400 hover:underline">Recover transfer by burn hash</button>
            {recoverOpen && (
              <div className="mt-3 grid min-w-0 gap-3 rounded-xl border border-coco-dark-border p-3">
                <div className="grid min-w-0 gap-2">
                  <label htmlFor="recover-source" className="text-xs font-medium text-coco-dark-secondary">Source chain</label>
                  <select id="recover-source" aria-label="Recover source chain" value={recoverSource} onChange={(e) => setRecoverSource(e.target.value as SourceChain)} className="min-h-11 w-full rounded-xl border border-coco-dark-border bg-coco-dark-bg px-3 text-coco-dark-text">
                    <option value="Ethereum_Sepolia">Ethereum Sepolia</option><option value="Base_Sepolia">Base Sepolia</option>
                  </select>
                </div>
                <div className="grid min-w-0 gap-2">
                  <label htmlFor="recover-hash" className="text-xs font-medium text-coco-dark-secondary">Burn transaction hash</label>
                  <input id="recover-hash" value={recoverHash} onChange={(e) => setRecoverHash(e.target.value)} placeholder="0x…" className="min-h-11 w-full min-w-0 rounded-xl border border-coco-dark-border bg-coco-dark-bg px-3 font-mono text-xs text-coco-dark-text outline-none" />
                </div>
                {recoverError && <p role="alert" className="break-words text-sm text-coco-red-500">{recoverError}</p>}
                <button type="button" onClick={() => void submitRecoverByHash()} className="min-h-11 rounded-xl bg-coco-green-500 px-4 text-sm font-semibold text-white">Validate & recover</button>
              </div>
            )}

            {(sourceBalancesLoading || insufficientUsdc || insufficientGas) && amountRaw > 0n && (
              <div aria-live="polite" className="mt-4 grid gap-1 rounded-xl border border-coco-amber-500/25 bg-coco-amber-500/5 p-3 text-sm leading-6 text-coco-amber-500">
                {sourceBalancesLoading && <p>Source balances are still loading.</p>}
                {insufficientUsdc && <p>Insufficient source USDC.</p>}
                {insufficientGas && <p>Insufficient {meta.gas} for source gas.</p>}
              </div>
            )}

            {error && <div role="alert" className="mt-4 max-w-full whitespace-pre-wrap break-words rounded-xl border border-coco-red-500/25 bg-coco-red-500/5 p-3 text-sm leading-6 text-coco-red-500">{error}</div>}

            <button type="button" onClick={(event) => { dialogOpenerRef.current = event.currentTarget as HTMLElement; if (estimate) { setConfirming(true) } else { void estimateBridge() } }} disabled={!isConnected || wrongNetwork || estimateState === 'loading' || !validRecipient || amountRaw <= 0n || sourceBalancesLoading || insufficientUsdc || insufficientGas || isSubmitting} className="mt-5 flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-coco-green-500 px-4 font-semibold text-white shadow-lg shadow-coco-green-500/20 transition hover:bg-coco-green-600 disabled:cursor-not-allowed disabled:opacity-45">
              {estimateState === 'loading' ? <><LoaderCircle className="h-4 w-4 animate-spin" /> Estimating…</> : estimate ? 'Review transfer' : 'Estimate bridge'}
            </button>
          </Card>

          <div data-testid="bridge-sidebar" className="grid min-w-0 content-start gap-5 xl:w-full">
            <div data-testid="estimate-panel" className="min-w-0"><Card className="min-w-0 p-4 sm:p-5"><h2 className="font-semibold text-coco-dark-text">Estimate</h2>{estimate ? <dl className="mt-4 grid min-w-0 gap-3 text-sm"><EstimateRow label="Destination amount" value={`${estimate.destinationAmount} USDC`} strong /><EstimateRow label="CCTP protocol fee" labelTestId="cctp-protocol-fee-label" valueTestId="cctp-protocol-fee-amount" valueTitle={estimate.providerFee === null ? '0 USDC — Standard transfer' : `${estimate.providerFee} USDC`} value={estimate.providerFee === null ? '0 USDC — Standard transfer' : `${estimate.providerFee} USDC`} /><EstimateRow label="Forwarding Service fee" value={estimate.forwarderFee === null ? 'Unavailable' : `${estimate.forwarderFee} USDC`} /><EstimateRow label="Application fee" value="0 USDC" /><EstimateRow label="Total estimated fee" value={`${estimate.totalFee} USDC`} strong /><EstimateRow label="Estimated duration" value={estimate.duration ?? 'Not provided by Bridge Kit 1.12.1'} icon={<Clock3 className="h-4 w-4" />} /><EstimateRow label="Source gas requirement" value={estimate.gas.map((item) => `${item.name}: ${item.fees?.fee ?? 'unavailable'} ${item.token}`).join(', ') || 'Unavailable'} /><EstimateRow label="Destination gas" labelTestId="destination-gas-label" valueTestId="destination-gas-status" value="Paid by Forwarding Service" /></dl> : <p className="mt-3 break-words text-sm leading-6 text-coco-dark-muted">Enter an amount and request an SDK estimate. Submission stays disabled if fees, gas, or forwarding availability cannot be estimated.</p>}{estimate?.warnings?.length ? <ul className="mt-3 grid gap-1 rounded-xl border border-coco-teal-400/20 bg-coco-teal-400/5 p-3 text-xs leading-5 text-coco-dark-secondary">{estimate.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}</Card></div>

            <Card className="min-w-0 p-4 sm:p-5"><h2 className="font-semibold text-coco-dark-text">Bridge lifecycle</h2>{activeAttempt ? (<><p role="status" aria-label="Bridge lifecycle update" className="sr-only">{lifecycleStatusText}</p><ol data-testid="lifecycle-steps" className="mt-4 grid min-w-0 gap-3">{STEP_ORDER.map((name) => <StepRow key={name} step={activeAttempt.steps[name]} />)}</ol>{activeAttempt.overallState === 'complete' && <p className="mt-4 break-words text-sm text-coco-green-500">Bridge complete — USDC arrived on Arc Testnet.</p>}{['waiting-attestation', 'forwarding', 'unknown-checking', 'burning'].includes(activeAttempt.overallState) && <button type="button" onClick={() => { if (activeAttempt.steps.burn.txHash) { setCheckingStatus(true); void startPolling(activeAttempt).finally(() => setCheckingStatus(false)) } }} disabled={checkingStatus} className="mt-3 min-h-10 rounded-xl border border-coco-dark-border px-3 text-xs font-semibold text-coco-teal-400">{checkingStatus ? 'Checking…' : 'Check status'}</button>}</>) : <p className="mt-3 break-words text-sm text-coco-dark-muted">No active transfer. Your lifecycle, hashes, and recovery records appear here.</p>}</Card>

            {showHistory && (
              <Card className="min-w-0 p-4 sm:p-5"><h2 className="font-semibold text-coco-dark-text">Recent bridge transfers</h2>
                <ul data-testid="bridge-history" className="mt-4 grid min-w-0 gap-3">
                  {attempts.filter((a) => a.id !== activeAttempt?.id).slice(-5).reverse().map((a) => (
                    <li key={a.id} data-testid="history-item" className="grid min-w-0 gap-1 rounded-xl border border-coco-dark-border p-3">
                      <div className="flex min-w-0 items-center justify-between gap-2">
                        <span className="break-words text-sm font-medium text-coco-dark-text">{a.sourceChain} → Arc Testnet</span>
                        <span className="shrink-0 text-xs text-coco-dark-muted">{a.amount} USDC</span>
                      </div>
                      <p className="break-words text-xs text-coco-dark-muted">{a.overallState}</p>
                      <div className="mt-1 flex min-w-0 flex-wrap gap-2">
                        <button type="button" onClick={() => setActiveAttempt(a)} className="min-h-9 rounded-lg border border-coco-dark-border px-2 text-xs font-semibold text-coco-teal-400">View progress</button>
                        <button type="button" onClick={() => { if (a.steps.burn.txHash) void startPolling(a) }} className="min-h-9 rounded-lg border border-coco-dark-border px-2 text-xs font-semibold text-coco-teal-400">Check status</button>
                        {['complete', 'terminal-error'].includes(a.overallState) && <button type="button" onClick={() => dismissAttempt(a.id)} className="min-h-9 rounded-lg border border-coco-dark-border px-2 text-xs text-coco-dark-muted">Dismiss</button>}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </div>

        {activeAttempt?.overallState === 'complete' && (
          <Card className="mt-5 border-coco-green-500/25 p-5"><p role="status" aria-label="Bridge completed" className="sr-only">USDC arrived on Arc Testnet</p><div className="flex items-start gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-coco-green-500/15 text-coco-green-500"><Check className="h-5 w-5" /></div><div><h2 className="font-semibold text-coco-dark-text">USDC arrived on Arc Testnet</h2><p className="mt-1 text-sm text-coco-dark-muted">Choose a next action. No swap or liquidity transaction runs automatically.</p></div></div><div className="mt-5 grid gap-2 sm:grid-cols-3"><Link to={bridgeSwapPath(estimate?.destinationAmount)} className="flex min-h-11 items-center justify-center rounded-xl bg-coco-green-500 px-3 text-sm font-semibold text-white">Swap USDC to EURC</Link><Link to={bridgeLiquidityPath} className="flex min-h-11 items-center justify-center rounded-xl border border-coco-dark-border px-3 text-sm font-semibold text-coco-dark-text">Add Liquidity</Link>{activeAttempt.steps['forwarded-mint'].txHash && <a href={arcExplorerTxUrl(activeAttempt.steps['forwarded-mint'].txHash!)} target="_blank" rel="noreferrer" className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-coco-dark-border px-3 text-sm font-semibold text-coco-teal-400">View destination tx <ExternalLink className="h-4 w-4" /></a>}</div></Card>
        )}
      </div>

      {confirming && estimate && (
        <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="bridge-confirm-title" data-testid="bridge-confirmation-dialog" className="fixed inset-0 z-[70] grid place-items-end bg-black/65 p-0 backdrop-blur-sm sm:place-items-center sm:p-4"><div className="max-h-[90vh] w-full overflow-y-auto rounded-t-3xl border border-coco-dark-border bg-coco-dark-surface p-5 shadow-coco-3 sm:max-w-lg sm:rounded-3xl sm:p-6"><h2 id="bridge-confirm-title" className="text-xl font-semibold text-coco-dark-text">Confirm bridge</h2><p className="mt-2 text-sm text-coco-dark-muted">Your wallet will approve and burn USDC on {meta.label}. Circle forwards the mint to Arc Testnet.</p><dl className="mt-5 grid gap-3 text-sm"><EstimateRow label="From" value={meta.label} /><EstimateRow label="To" value="Arc Testnet (chain 5042002)" /><EstimateRow label="Recipient" labelTestId="recipient-label" valueTestId="recipient-address" valueTitle={recipient} value={recipient} /><EstimateRow label="Amount" value={`${amount} USDC`} /><EstimateRow label="Mode" labelTestId="transfer-mode-label" valueTestId="transfer-mode" value={mode === 'SLOW' ? 'Standard' : 'Fast'} /><EstimateRow label="Expected mint" value={`${estimate.destinationAmount} USDC`} strong /><EstimateRow label="Total fees" value={`${estimate.totalFee} USDC`} /></dl><div className="mt-5 rounded-xl border border-coco-teal-400/20 bg-coco-teal-400/5 p-3 text-xs leading-5 text-coco-dark-secondary">The Forwarding Service fee is deducted from the destination mint. No direct-mint fallback occurs silently.</div><div className="mt-5 grid grid-cols-2 gap-3"><button type="button" onClick={() => setConfirming(false)} className="min-h-12 rounded-xl border border-coco-dark-border text-sm font-semibold text-coco-dark-secondary">Cancel</button><button type="button" onClick={() => void executeBridge()} disabled={isSubmitting} className="min-h-12 rounded-xl bg-coco-green-500 text-sm font-semibold text-white disabled:opacity-50">{isSubmitting ? 'Waiting for wallet…' : 'Confirm & bridge'}</button></div></div></div>
      )}
    </main>
  )
}

function EstimateRow({ label, value, strong, icon, labelTestId, valueTestId, valueTitle }: { label: string; value: string; strong?: boolean; icon?: React.ReactNode; labelTestId?: string; valueTestId?: string; valueTitle?: string }) {
  return <div className="flex min-w-0 items-start justify-between gap-4 border-b border-coco-dark-border/70 pb-3 last:border-0 last:pb-0"><dt className="flex items-center gap-1.5 text-coco-dark-muted" data-testid={labelTestId}>{icon}{label}</dt><dd className={`min-w-0 break-words text-right ${strong ? 'font-semibold text-coco-dark-text' : 'text-coco-dark-secondary'}`} data-testid={valueTestId} title={valueTitle}>{value}</dd></div>
}
