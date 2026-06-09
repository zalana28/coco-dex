import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useAccount, useChainId, usePublicClient, useReadContract, useWriteContract } from 'wagmi'
import { AlertTriangle, Droplets, RefreshCw } from 'lucide-react'
import { TransactionProgressPanel } from '@/components/transactions/TransactionProgressPanel'
import {
  COCO_STABLE_ERC20_LIQUIDITY_ABI,
  COCO_STABLE_POOL,
  COCO_STABLE_POOL_ADD_LIQUIDITY_ABI,
} from '@/config/cocoStablePool'
import { arcTestnet } from '@/config/chains'
import { formatTokenAmount, parseTokenAmount, truncateAddress } from '@/utils/format'
import { sanitizeTokenInput, validateTokenAmount } from '@/utils/validation'
import { useTransactionProgress } from '@/hooks/useTransactionProgress'
import type { TransactionType } from '@/types/transactions'

const ARC_CHAIN_ID = arcTestnet.id
const DEFAULT_USDC_AMOUNT = '0.1'
const DEFAULT_EURC_AMOUNT = '0.1'
const DEFAULT_SLIPPAGE_BPS = 50
const SLIPPAGE_PRESETS = [
  { label: '0.1%', bps: 10 },
  { label: '0.5%', bps: 50 },
  { label: '1.0%', bps: 100 },
] as const
const RECEIPT_TIMEOUT_MS = 120_000
const RECEIPT_BACKOFF_MS = [3_000, 5_000, 8_000, 13_000, 15_000] as const
const RATE_LIMIT_COPY = 'Arc Testnet RPC is rate-limited. Please wait a minute, then click Check status or try again.'
const RATE_LIMIT_RETRY_COPY = 'Arc Testnet RPC is rate-limited. Waiting before retrying...'
const MANUAL_RATE_LIMIT_COPY = 'Arc Testnet RPC is rate-limited. Wait a moment and try Check status again.'
const TOKEN_READ_QUERY_OPTIONS = {
  refetchOnWindowFocus: false,
  staleTime: 45_000,
  gcTime: 5 * 60_000,
} as const

type ReceiptResult = 'success' | 'reverted' | 'timeout' | 'not_found' | 'rate_limited'

function sqrtBigInt(value: bigint) {
  if (value < BigInt(2)) return value

  let x0 = value / BigInt(2)
  let x1 = (x0 + value / x0) / BigInt(2)
  while (x1 < x0) {
    x0 = x1
    x1 = (x0 + value / x0) / BigInt(2)
  }
  return x0
}

function stableLiquidityInvariant(balance0: bigint, balance1: bigint, amplification: bigint) {
  const smaller = balance0 < balance1 ? balance0 : balance1
  const larger = balance0 < balance1 ? balance1 : balance0

  return (smaller * amplification * BigInt(2)) + (larger - smaller)
}

function estimateLpOut({
  amount0,
  amount1,
  reserve0,
  reserve1,
  totalSupply,
  amplification,
}: {
  amount0: bigint
  amount1: bigint
  reserve0: bigint
  reserve1: bigint
  totalSupply: bigint
  amplification: bigint
}) {
  if (amount0 <= BigInt(0) || amount1 <= BigInt(0)) return BigInt(0)
  if (totalSupply === BigInt(0)) return sqrtBigInt(amount0 * amount1)

  const invariantBefore = stableLiquidityInvariant(reserve0, reserve1, amplification)
  if (invariantBefore === BigInt(0)) return BigInt(0)

  const invariantAfter = stableLiquidityInvariant(reserve0 + amount0, reserve1 + amount1, amplification)
  const invariantDelta = invariantAfter - invariantBefore

  return (invariantDelta * totalSupply) / invariantBefore
}

function isUserRejected(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase()
  return message.includes('rejected') || message.includes('denied') || message.includes('cancelled') || message.includes('canceled')
}

function isRateLimitError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  return message.includes('429') || /rate.?limit/i.test(message) || /too many requests/i.test(message)
}

function getFriendlyErrorMessage(error: unknown) {
  if (isUserRejected(error)) return 'Rejected by user'
  if (isRateLimitError(error)) return RATE_LIMIT_COPY
  return error instanceof Error ? error.message : String(error)
}

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

type ActionState = {
  action: 'connect' | 'wrong-network' | 'paused' | 'enter' | 'estimate-unavailable' | 'insufficient-usdc' | 'insufficient-eurc' | 'approve-usdc' | 'approve-eurc' | 'add' | 'pending' | 'success'
  label: string
  disabled: boolean
}

function applySlippage(rawAmount: bigint, slippageBps: number) {
  const safeBps = BigInt(Math.min(10_000, Math.max(0, Math.trunc(slippageBps))))
  return (rawAmount * (10_000n - safeBps)) / 10_000n
}

function SlippageSelector({
  valueBps,
  onChange,
}: {
  valueBps: number
  onChange: (nextValueBps: number) => void
}) {
  return (
    <div className="rounded-xl border border-coco-dark-border bg-coco-dark-surface/55 p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs text-coco-dark-muted">Slippage tolerance</p>
          <p className="mt-1 text-xs text-coco-dark-text">{(valueBps / 100).toFixed(1)}%</p>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {SLIPPAGE_PRESETS.map((preset) => (
            <button
              key={preset.bps}
              type="button"
              onClick={() => onChange(preset.bps)}
              className={`rounded-lg border px-3 py-2 text-xs font-semibold transition-colors ${
                valueBps === preset.bps
                  ? 'border-coco-teal-400/35 bg-coco-teal-400/15 text-coco-teal-300'
                  : 'border-coco-dark-border bg-coco-dark-bg/70 text-coco-dark-muted hover:border-coco-teal-400/25 hover:text-coco-dark-text'
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
      </div>
      {valueBps > 200 && (
        <p className="mt-2 rounded-lg border border-coco-amber-500/20 bg-coco-amber-500/10 px-3 py-2 text-xs text-coco-amber-500">
          High slippage. Use tiny test amounts only.
        </p>
      )}
    </div>
  )
}

export function CocoStableAddLiquidityPanel({
  reserve0,
  reserve1,
  totalSupply,
  lpDecimals,
  amplificationParameter,
  paused,
  onRefreshPool,
}: {
  reserve0: bigint
  reserve1: bigint
  totalSupply: bigint
  lpDecimals: number
  amplificationParameter: bigint
  paused: boolean
  onRefreshPool: () => void
}) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const [amount0Input, setAmount0Input] = useState(DEFAULT_USDC_AMOUNT)
  const [amount1Input, setAmount1Input] = useState(DEFAULT_EURC_AMOUNT)
  const [slippageBps, setSlippageBps] = useState(DEFAULT_SLIPPAGE_BPS)
  const [txError, setTxError] = useState<string | null>(null)
  const [lastSuccessHash, setLastSuccessHash] = useState<`0x${string}`>()
  const [addLiquidityConfirmed, setAddLiquidityConfirmed] = useState(false)
  const [timedOutSteps, setTimedOutSteps] = useState<Partial<Record<TransactionType, boolean>>>({})
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)
  const tokenRefreshInFlightRef = useRef(false)
  const poolRefreshInFlightRef = useRef(false)
  const allowanceReadInFlightRef = useRef<Partial<Record<string, Promise<bigint>>>>({})
  const receiptPollInFlightRef = useRef<Partial<Record<string, Promise<ReceiptResult>>>>({})
  const txProgress = useTransactionProgress()
  const [token0, token1] = COCO_STABLE_POOL.tokens

  const { writeContract, isPending: isWalletPending } = useWriteContract()

  const token0Balance = useReadContract({
    address: token0.address as `0x${string}`,
    abi: COCO_STABLE_ERC20_LIQUIDITY_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address, ...TOKEN_READ_QUERY_OPTIONS },
  })

  const token1Balance = useReadContract({
    address: token1.address as `0x${string}`,
    abi: COCO_STABLE_ERC20_LIQUIDITY_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address, ...TOKEN_READ_QUERY_OPTIONS },
  })

  const token0Allowance = useReadContract({
    address: token0.address as `0x${string}`,
    abi: COCO_STABLE_ERC20_LIQUIDITY_ABI,
    functionName: 'allowance',
    args: address ? [address, COCO_STABLE_POOL.poolAddress] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address, ...TOKEN_READ_QUERY_OPTIONS },
  })

  const token1Allowance = useReadContract({
    address: token1.address as `0x${string}`,
    abi: COCO_STABLE_ERC20_LIQUIDITY_ABI,
    functionName: 'allowance',
    args: address ? [address, COCO_STABLE_POOL.poolAddress] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address, ...TOKEN_READ_QUERY_OPTIONS },
  })

  const amount0Validation = validateTokenAmount(amount0Input, token0.decimals, { allowTrailingDot: false })
  const amount1Validation = validateTokenAmount(amount1Input, token1.decimals, { allowTrailingDot: false })
  const amount0Raw = amount0Validation.valid ? parseTokenAmount(amount0Input, token0.decimals) : BigInt(0)
  const amount1Raw = amount1Validation.valid ? parseTokenAmount(amount1Input, token1.decimals) : BigInt(0)
  const balance0 = token0Balance.data as bigint | undefined
  const balance1 = token1Balance.data as bigint | undefined
  const allowance0 = (token0Allowance.data as bigint | undefined) ?? BigInt(0)
  const allowance1 = (token1Allowance.data as bigint | undefined) ?? BigInt(0)
  const needsUsdcApproval = amount0Raw > BigInt(0) && allowance0 < amount0Raw
  const needsEurcApproval = amount1Raw > BigInt(0) && allowance1 < amount1Raw
  const activeStep = txProgress.activeStep
  const isStepConfirming = activeStep?.status === 'submitted' || activeStep?.status === 'pending_onchain'
  const isStepWaitingForWallet = activeStep?.status === 'waiting_wallet_confirmation'
  const activeTxHash = activeStep?.txHash
  const estimatedLpOut = useMemo(() => estimateLpOut({
    amount0: amount0Raw,
    amount1: amount1Raw,
    reserve0,
    reserve1,
    totalSupply,
    amplification: amplificationParameter,
  }), [amount0Raw, amount1Raw, reserve0, reserve1, totalSupply, amplificationParameter])
  const hasEstimatedLpOut = amount0Validation.valid && amount1Validation.valid && estimatedLpOut > BigInt(0)
  const minLpOutRaw = hasEstimatedLpOut ? applySlippage(estimatedLpOut, slippageBps) : BigInt(0)

  const handleAmountChange = (value: string, setter: (nextValue: string) => void, decimals: number) => {
    const sanitized = sanitizeTokenInput(value, decimals)
    if (sanitized !== null) {
      setAddLiquidityConfirmed(false)
      setter(sanitized)
    }
  }

  const refetchTokenState = useCallback(async () => {
    if (tokenRefreshInFlightRef.current) return

    tokenRefreshInFlightRef.current = true
    try {
      await Promise.allSettled([
        token0Balance.refetch(),
        token1Balance.refetch(),
        token0Allowance.refetch(),
        token1Allowance.refetch(),
      ])
    } finally {
      tokenRefreshInFlightRef.current = false
    }
  }, [token0Balance, token1Balance, token0Allowance, token1Allowance])

  const refetchPoolState = useCallback(() => {
    if (poolRefreshInFlightRef.current) return

    poolRefreshInFlightRef.current = true
    onRefreshPool()
    window.setTimeout(() => {
      poolRefreshInFlightRef.current = false
    }, 1_000)
  }, [onRefreshPool])

  const refetchAfterReceiptSuccess = useCallback(() => {
    void refetchTokenState()
    refetchPoolState()
  }, [refetchPoolState, refetchTokenState])

  const readAllowance = useCallback(async (tokenAddress: `0x${string}`) => {
    if (!publicClient || !address) return BigInt(0)
    const existing = allowanceReadInFlightRef.current[tokenAddress]
    if (existing) return existing

    const readPromise = publicClient.readContract({
      address: tokenAddress,
      abi: COCO_STABLE_ERC20_LIQUIDITY_ABI,
      functionName: 'allowance',
      args: [address, COCO_STABLE_POOL.poolAddress],
    }).then((allowance) => allowance as bigint)

    allowanceReadInFlightRef.current[tokenAddress] = readPromise
    try {
      return await readPromise
    } finally {
      delete allowanceReadInFlightRef.current[tokenAddress]
    }
  }, [address, publicClient])

  const confirmAllowance = useCallback(async (tokenAddress: `0x${string}`, requiredAmount: bigint) => {
    const allowance = await readAllowance(tokenAddress)
    return allowance >= requiredAmount
  }, [readAllowance])

  const getReceiptStatus = useCallback(async (txHash: `0x${string}`): Promise<ReceiptResult> => {
    if (!publicClient) return 'not_found'

    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
      return receipt.status === 'success' ? 'success' : 'reverted'
    } catch (error) {
      if (isRateLimitError(error)) return 'rate_limited'
      return 'not_found'
    }
  }, [publicClient])

  const waitForReceiptWithFallback = useCallback(async (txHash: `0x${string}`): Promise<ReceiptResult> => {
    if (!publicClient) return 'not_found'

    const existing = receiptPollInFlightRef.current[txHash]
    if (existing) return existing

    const pollPromise = (async () => {
      const startedAt = Date.now()
      let attempt = 0

      while (Date.now() - startedAt < RECEIPT_TIMEOUT_MS) {
        const waitMs = RECEIPT_BACKOFF_MS[Math.min(attempt, RECEIPT_BACKOFF_MS.length - 1)] ?? 15_000
        await delay(waitMs)

        const status = await getReceiptStatus(txHash)
        if (status === 'success' || status === 'reverted') return status

        if (status === 'rate_limited') {
          setTxError(RATE_LIMIT_RETRY_COPY)
          attempt += 2
          continue
        }

        attempt += 1
      }

      return 'timeout'
    })()

    receiptPollInFlightRef.current[txHash] = pollPromise
    try {
      return await pollPromise
    } finally {
      delete receiptPollInFlightRef.current[txHash]
    }
  }, [getReceiptStatus, publicClient])

  const markStepSuccessFromChain = useCallback(async (step: TransactionType, txHash: `0x${string}`, requiredAmount?: bigint) => {
    if (step === 'approve_usdc') {
      if (requiredAmount === undefined) return false
      let allowanceConfirmed: boolean
      try {
        allowanceConfirmed = await confirmAllowance(token0.address as `0x${string}`, requiredAmount)
      } catch (error) {
        if (isRateLimitError(error)) setTxError(RATE_LIMIT_COPY)
        else setTxError(getFriendlyErrorMessage(error))
        return false
      }
      if (!allowanceConfirmed) {
        setTxError('USDC approval confirmed, but allowance is still below the entered amount. Click Check status or approve again.')
        return false
      }
    }

    if (step === 'approve_eurc') {
      if (requiredAmount === undefined) return false
      let allowanceConfirmed: boolean
      try {
        allowanceConfirmed = await confirmAllowance(token1.address as `0x${string}`, requiredAmount)
      } catch (error) {
        if (isRateLimitError(error)) setTxError(RATE_LIMIT_COPY)
        else setTxError(getFriendlyErrorMessage(error))
        return false
      }
      if (!allowanceConfirmed) {
        setTxError('EURC approval confirmed, but allowance is still below the entered amount. Click Check status or approve again.')
        return false
      }
    }

    if (step === 'add_liquidity') {
      setAddLiquidityConfirmed(true)
      setLastSuccessHash(txHash)
    }

    refetchAfterReceiptSuccess()
    setTimedOutSteps((prev) => ({ ...prev, [step]: false }))
    txProgress.markSuccess(step)
    return true
  }, [confirmAllowance, refetchAfterReceiptSuccess, token0.address, token1.address, txProgress])

  const monitorTransaction = useCallback(async (step: TransactionType, txHash: `0x${string}`, requiredAmount?: bigint) => {
    setTimedOutSteps((prev) => ({ ...prev, [step]: false }))
    const receiptStatus = await waitForReceiptWithFallback(txHash)

    if (receiptStatus === 'success') {
      await markStepSuccessFromChain(step, txHash, requiredAmount)
      return
    }

    if (receiptStatus === 'reverted') {
      setTxError('Transaction reverted')
      txProgress.markFailed(step, 'Transaction reverted')
      return
    }

    if (receiptStatus === 'rate_limited') {
      setTxError(RATE_LIMIT_COPY)
    }

    const recovered = step === 'approve_usdc' || step === 'approve_eurc'
      ? await markStepSuccessFromChain(step, txHash, requiredAmount)
      : false
    if (!recovered) setTimedOutSteps((prev) => ({ ...prev, [step]: true }))
  }, [markStepSuccessFromChain, txProgress, waitForReceiptWithFallback])

  const ensureFlow = useCallback(() => {
    if (txProgress.currentFlow && !txProgress.isFlowComplete) return

    const steps: { type: TransactionType; label: string }[] = []
    if (needsUsdcApproval) steps.push({ type: 'approve_usdc', label: 'Approve USDC' })
    if (needsEurcApproval) steps.push({ type: 'approve_eurc', label: 'Approve EURC' })
    steps.push({ type: 'add_liquidity', label: 'Add Liquidity' })
    txProgress.startFlow(steps)
  }, [needsUsdcApproval, needsEurcApproval, txProgress])

  const actionState: ActionState = useMemo(() => {
    if (!isConnected || !address) return { action: 'connect', label: 'Connect Wallet', disabled: true }
    if (chainId !== ARC_CHAIN_ID) return { action: 'wrong-network', label: 'Wrong Network', disabled: true }
    if (paused) return { action: 'paused', label: 'Pool Paused', disabled: true }
    if (!amount0Validation.valid || !amount1Validation.valid) return { action: 'enter', label: amount0Validation.error ?? amount1Validation.error ?? 'Enter Amounts', disabled: true }
    if (!hasEstimatedLpOut) return { action: 'estimate-unavailable', label: 'LP estimate unavailable', disabled: true }
    if (balance0 !== undefined && amount0Raw > balance0) return { action: 'insufficient-usdc', label: 'Insufficient USDC', disabled: true }
    if (balance1 !== undefined && amount1Raw > balance1) return { action: 'insufficient-eurc', label: 'Insufficient EURC', disabled: true }
    if (isWalletPending || isStepWaitingForWallet) return { action: 'pending', label: 'Waiting for wallet', disabled: true }
    if (isStepConfirming) return { action: 'pending', label: 'Confirming on Arc Testnet', disabled: true }
    if (addLiquidityConfirmed) return { action: 'success', label: 'Confirmed', disabled: true }
    if (needsUsdcApproval) return { action: 'approve-usdc', label: 'Approve USDC', disabled: false }
    if (needsEurcApproval) return { action: 'approve-eurc', label: 'Approve EURC', disabled: false }
    return { action: 'add', label: 'Add Liquidity', disabled: false }
  }, [isConnected, address, chainId, paused, amount0Validation, amount1Validation, hasEstimatedLpOut, balance0, balance1, amount0Raw, amount1Raw, isWalletPending, isStepWaitingForWallet, isStepConfirming, addLiquidityConfirmed, needsUsdcApproval, needsEurcApproval])

  const approveToken = useCallback((tokenAddress: `0x${string}`, amount: bigint, step: TransactionType) => {
    setTxError(null)
    ensureFlow()
    txProgress.resetStep(step)
    txProgress.markWaiting(step)
    writeContract(
      {
        address: tokenAddress,
        abi: COCO_STABLE_ERC20_LIQUIDITY_ABI,
        functionName: 'approve',
        args: [COCO_STABLE_POOL.poolAddress, amount],
        chainId: ARC_CHAIN_ID,
      },
      {
        onSuccess: (hash) => {
          txProgress.markSubmitted(step, hash)
          void monitorTransaction(step, hash, amount)
        },
        onError: (error) => {
          const message = getFriendlyErrorMessage(error)
          if (isUserRejected(error)) {
            setTxError(message)
            txProgress.markRejected(step)
          } else {
            setTxError(message)
            txProgress.markFailed(step, message)
          }
        },
      }
    )
  }, [ensureFlow, monitorTransaction, txProgress, writeContract])

  const handleAddLiquidity = useCallback(async () => {
    setTxError(null)
    setAddLiquidityConfirmed(false)

    if (!address || chainId !== ARC_CHAIN_ID || paused) return
    if (!amount0Validation.valid || !amount1Validation.valid || !hasEstimatedLpOut) return
    if (balance0 !== undefined && amount0Raw > balance0) return
    if (balance1 !== undefined && amount1Raw > balance1) return
    if (allowance0 < amount0Raw || allowance1 < amount1Raw) return

    ensureFlow()
    txProgress.resetStep('add_liquidity')
    txProgress.markWaiting('add_liquidity')

    try {
      if (!publicClient) {
        throw new Error('Arc Testnet client is unavailable. Check wallet network and RPC configuration.')
      }

      await publicClient.simulateContract({
        account: address,
        address: COCO_STABLE_POOL.poolAddress,
        abi: COCO_STABLE_POOL_ADD_LIQUIDITY_ABI,
        functionName: 'addLiquidity',
        args: [amount0Raw, amount1Raw, minLpOutRaw, address],
      })
    } catch (error) {
      const message = isRateLimitError(error)
        ? RATE_LIMIT_COPY
        : error instanceof Error ? error.message : 'Add liquidity simulation failed'
      setTxError(message)
      txProgress.markFailed('add_liquidity', message.slice(0, 80))
      return
    }

    writeContract(
      {
        address: COCO_STABLE_POOL.poolAddress,
        abi: COCO_STABLE_POOL_ADD_LIQUIDITY_ABI,
        functionName: 'addLiquidity',
        args: [amount0Raw, amount1Raw, minLpOutRaw, address],
        chainId: ARC_CHAIN_ID,
      },
      {
        onSuccess: (hash) => {
          setLastSuccessHash(hash)
          txProgress.markSubmitted('add_liquidity', hash)
          void monitorTransaction('add_liquidity', hash)
        },
        onError: (error) => {
          const message = getFriendlyErrorMessage(error)
          if (isUserRejected(error)) {
            setTxError(message)
            txProgress.markRejected('add_liquidity')
          } else {
            setTxError(message)
            txProgress.markFailed('add_liquidity', message)
          }
        },
      }
    )
  }, [address, chainId, paused, amount0Validation.valid, amount1Validation.valid, hasEstimatedLpOut, balance0, balance1, amount0Raw, amount1Raw, minLpOutRaw, allowance0, allowance1, ensureFlow, txProgress, publicClient, writeContract, monitorTransaction])

  const handleAction = () => {
    if (actionState.action === 'approve-usdc') {
      approveToken(token0.address as `0x${string}`, amount0Raw, 'approve_usdc')
      return
    }
    if (actionState.action === 'approve-eurc') {
      approveToken(token1.address as `0x${string}`, amount1Raw, 'approve_eurc')
      return
    }
    if (actionState.action === 'add') {
      void handleAddLiquidity()
    }
  }

  const handleCheckStatus = useCallback(async () => {
    if (!txProgress.currentFlow || isCheckingStatus) return

    try {
      setIsCheckingStatus(true)
      setTxError(null)

      const step = txProgress.activeStep
      if (!step?.txHash || step.status === 'success' || step.status === 'failed' || step.status === 'rejected' || step.status === 'idle') return

      const requiredAmount = step.type === 'approve_usdc'
        ? amount0Raw
        : step.type === 'approve_eurc'
          ? amount1Raw
          : undefined
      const status = await getReceiptStatus(step.txHash)

      if (status === 'rate_limited') {
        setTxError(MANUAL_RATE_LIMIT_COPY)
        return
      }

      if (status === 'success') {
        await markStepSuccessFromChain(step.type, step.txHash, requiredAmount)
        return
      }

      if (status === 'reverted') {
        setTxError('Transaction reverted')
        txProgress.markFailed(step.type, 'Transaction reverted')
        return
      }

      if ((step.type === 'approve_usdc' || step.type === 'approve_eurc') && requiredAmount !== undefined) {
        await markStepSuccessFromChain(step.type, step.txHash, requiredAmount)
      }
    } finally {
      setIsCheckingStatus(false)
    }
  }, [amount0Raw, amount1Raw, getReceiptStatus, isCheckingStatus, markStepSuccessFromChain, txProgress])

  const activeStepTimedOut = activeStep?.type ? timedOutSteps[activeStep.type] === true : false
  const showRecovery = !!activeTxHash && isStepConfirming

  useEffect(() => {
    if (!address || isWalletPending || isStepWaitingForWallet || isStepConfirming) return

    const timeoutId = window.setTimeout(() => {
      void refetchTokenState()
    }, 600)

    return () => window.clearTimeout(timeoutId)
  }, [address, amount0Input, amount1Input, isStepConfirming, isStepWaitingForWallet, isWalletPending, refetchTokenState])

  return (
    <div className="mt-4 rounded-xl border border-blue-500/15 bg-coco-dark-bg/55 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-coco-teal-400">Arc Testnet only</p>
          <h4 className="mt-1 flex items-center gap-2 text-base font-semibold text-coco-dark-text">
            <Droplets className="h-4 w-4 text-coco-teal-400" />
            Add testnet liquidity
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-coco-dark-muted">
            Uses exact approvals for the entered USDC and EURC amounts before calling CocoStablePool V1.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LiquidityBadge>Arc Testnet</LiquidityBadge>
          <LiquidityBadge>LP Beta</LiquidityBadge>
          <LiquidityBadge>Unaudited</LiquidityBadge>
          <LiquidityBadge>Not routed</LiquidityBadge>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <LiquidityInput
          label="USDC amount"
          value={amount0Input}
          onChange={(value) => handleAmountChange(value, setAmount0Input, token0.decimals)}
          balance={balance0 !== undefined ? `${formatTokenAmount(balance0, token0.decimals)} USDC` : isConnected ? '...' : 'Connect wallet'}
          error={amount0Input ? amount0Validation.error : null}
        />
        <LiquidityInput
          label="EURC amount"
          value={amount1Input}
          onChange={(value) => handleAmountChange(value, setAmount1Input, token1.decimals)}
          balance={balance1 !== undefined ? `${formatTokenAmount(balance1, token1.decimals)} EURC` : isConnected ? '...' : 'Connect wallet'}
          error={amount1Input ? amount1Validation.error : null}
        />
        <LiquidityInput
          label="Min cSLP out"
          value={hasEstimatedLpOut ? formatTokenAmount(minLpOutRaw, lpDecimals) : ''}
          onChange={() => {}}
          balance={`Derived from ${(slippageBps / 100).toFixed(1)}% slippage`}
          error={hasEstimatedLpOut ? null : 'Enter valid amounts to estimate cSLP'}
          readOnly
        />
      </div>

      <div className="mt-3">
        <SlippageSelector valueBps={slippageBps} onChange={setSlippageBps} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-coco-dark-border bg-coco-dark-surface/55 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoMetric label="Current USDC reserve" value={`${formatTokenAmount(reserve0, 6)} USDC`} />
        <InfoMetric label="Current EURC reserve" value={`${formatTokenAmount(reserve1, 6)} EURC`} />
        <InfoMetric label="LP recipient" value={address ? truncateAddress(address) : 'Connect wallet'} mono />
        <InfoMetric
          label="Estimated cSLP out"
          value={hasEstimatedLpOut ? `${formatTokenAmount(estimatedLpOut, lpDecimals)} cSLP` : 'Unavailable'}
          mono
        />
      </div>

      <div className="mt-3 rounded-lg border border-coco-amber-500/20 bg-coco-amber-500/10 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-coco-amber-500" />
          <p className="text-xs leading-relaxed text-coco-amber-500">
            Arc Testnet LP Beta. Use tiny test amounts only. Unaudited. Not routed. Beta observability only.
          </p>
        </div>
      </div>

      {txError && (
        <p className="mt-3 rounded-lg border border-coco-red-500/20 bg-coco-red-500/10 px-3 py-2 text-xs leading-relaxed text-coco-red-500">
          {txError}
        </p>
      )}

      {showRecovery && (
        <div className="mt-3 rounded-lg border border-coco-amber-500/20 bg-coco-amber-500/10 p-3">
          {activeStepTimedOut && (
            <p className="text-xs leading-relaxed text-coco-amber-500">
              Transaction may already be confirmed. Click Check status.
            </p>
          )}
          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <a
              href={`https://testnet.arcscan.app/tx/${activeTxHash}`}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-xs text-coco-teal-400 hover:text-coco-teal-300"
            >
              View transaction on Arcscan
            </a>
            <button
              type="button"
              onClick={handleCheckStatus}
              disabled={isCheckingStatus}
              className="inline-flex items-center justify-center gap-2 rounded-lg border border-coco-teal-400/25 bg-coco-teal-400/10 px-3 py-2 text-xs font-semibold text-coco-teal-300 transition-colors hover:bg-coco-teal-400/15 disabled:cursor-not-allowed disabled:opacity-60"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isCheckingStatus ? 'animate-spin' : ''}`} />
              {isCheckingStatus ? 'Checking...' : 'Check status'}
            </button>
          </div>
        </div>
      )}

      {lastSuccessHash && addLiquidityConfirmed && (
        <a
          href={`https://testnet.arcscan.app/tx/${lastSuccessHash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 inline-flex rounded-lg border border-coco-green-500/25 bg-coco-green-500/10 px-3 py-2 text-xs font-medium text-coco-green-500 transition-colors hover:bg-coco-green-500/15"
        >
          View add liquidity transaction
        </a>
      )}

      <button
        type="button"
        disabled={actionState.disabled}
        onClick={handleAction}
        className={`mt-4 w-full rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
          actionState.disabled
            ? 'cursor-not-allowed bg-coco-dark-border text-coco-dark-muted'
            : 'bg-coco-green-500 text-white shadow-lg shadow-coco-green-500/20 hover:-translate-y-0.5 hover:bg-coco-green-600'
        }`}
      >
        {actionState.label}
      </button>

      <TransactionProgressPanel
        currentFlow={txProgress.currentFlow}
        history={txProgress.history}
        onClear={txProgress.clearFlow}
        onCheckStatus={handleCheckStatus}
      />
    </div>
  )
}

function LiquidityBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md border border-coco-teal-400/25 bg-coco-teal-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-coco-teal-300">
      {children}
    </span>
  )
}

function LiquidityInput({
  label,
  value,
  onChange,
  balance,
  error,
  readOnly = false,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  balance: string
  error: string | null
  readOnly?: boolean
}) {
  return (
    <label className="block rounded-xl border border-coco-dark-border bg-coco-dark-surface/70 p-3">
      <span className="text-xs text-coco-dark-muted">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        readOnly={readOnly}
        className="mt-2 w-full min-w-0 bg-transparent font-mono text-lg text-coco-dark-text outline-none placeholder:text-coco-dark-border"
        placeholder="0.0"
      />
      <span className="mt-1 block truncate text-[11px] text-coco-dark-muted">{balance}</span>
      {error && <span className="mt-1 block text-[11px] text-coco-red-500">{error}</span>}
    </label>
  )
}

function InfoMetric({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-coco-dark-muted">{label}</p>
      <p className={`mt-1 truncate text-sm font-medium text-coco-dark-text ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  )
}
