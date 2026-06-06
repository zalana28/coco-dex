import { useCallback, useMemo, useState } from 'react'
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
const DEFAULT_MIN_LP_OUT = '0.099'
const RECEIPT_POLL_INTERVAL_MS = 2_000
const RECEIPT_TIMEOUT_MS = 75_000
const INITIAL_RECEIPT_WAIT_MS = 15_000

type ReceiptResult = 'success' | 'reverted' | 'timeout' | 'not_found'

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

function delay(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms)
  })
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number) {
  let timeoutId: number | undefined
  const timeout = new Promise<undefined>((resolve) => {
    timeoutId = window.setTimeout(() => resolve(undefined), timeoutMs)
  })
  const result = await Promise.race([promise, timeout])
  if (timeoutId !== undefined) window.clearTimeout(timeoutId)
  return result
}

type ActionState = {
  action: 'connect' | 'wrong-network' | 'paused' | 'enter' | 'insufficient-usdc' | 'insufficient-eurc' | 'approve-usdc' | 'approve-eurc' | 'add' | 'pending' | 'success'
  label: string
  disabled: boolean
}

export function CocoStableAddLiquidityPanel({
  reserve0,
  reserve1,
  totalSupply,
  amplificationParameter,
  paused,
  onRefreshPool,
}: {
  reserve0: bigint
  reserve1: bigint
  totalSupply: bigint
  amplificationParameter: bigint
  paused: boolean
  onRefreshPool: () => void
}) {
  const { address, isConnected } = useAccount()
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const [amount0Input, setAmount0Input] = useState(DEFAULT_USDC_AMOUNT)
  const [amount1Input, setAmount1Input] = useState(DEFAULT_EURC_AMOUNT)
  const [minLpOutInput, setMinLpOutInput] = useState(DEFAULT_MIN_LP_OUT)
  const [txError, setTxError] = useState<string | null>(null)
  const [lastSuccessHash, setLastSuccessHash] = useState<`0x${string}`>()
  const [addLiquidityConfirmed, setAddLiquidityConfirmed] = useState(false)
  const [timedOutSteps, setTimedOutSteps] = useState<Partial<Record<TransactionType, boolean>>>({})
  const [isCheckingStatus, setIsCheckingStatus] = useState(false)
  const txProgress = useTransactionProgress()
  const [token0, token1] = COCO_STABLE_POOL.tokens

  const { writeContract, isPending: isWalletPending } = useWriteContract()

  const token0Balance = useReadContract({
    address: token0.address as `0x${string}`,
    abi: COCO_STABLE_ERC20_LIQUIDITY_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 15_000 },
  })

  const token1Balance = useReadContract({
    address: token1.address as `0x${string}`,
    abi: COCO_STABLE_ERC20_LIQUIDITY_ABI,
    functionName: 'balanceOf',
    args: address ? [address] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 15_000 },
  })

  const token0Allowance = useReadContract({
    address: token0.address as `0x${string}`,
    abi: COCO_STABLE_ERC20_LIQUIDITY_ABI,
    functionName: 'allowance',
    args: address ? [address, COCO_STABLE_POOL.poolAddress] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 15_000 },
  })

  const token1Allowance = useReadContract({
    address: token1.address as `0x${string}`,
    abi: COCO_STABLE_ERC20_LIQUIDITY_ABI,
    functionName: 'allowance',
    args: address ? [address, COCO_STABLE_POOL.poolAddress] : undefined,
    chainId: ARC_CHAIN_ID,
    query: { enabled: !!address, refetchInterval: 15_000 },
  })

  const amount0Validation = validateTokenAmount(amount0Input, token0.decimals, { allowTrailingDot: false })
  const amount1Validation = validateTokenAmount(amount1Input, token1.decimals, { allowTrailingDot: false })
  const minLpOutValidation = validateTokenAmount(minLpOutInput, 6, { allowTrailingDot: false })
  const amount0Raw = amount0Validation.valid ? parseTokenAmount(amount0Input, token0.decimals) : BigInt(0)
  const amount1Raw = amount1Validation.valid ? parseTokenAmount(amount1Input, token1.decimals) : BigInt(0)
  const minLpOutRaw = minLpOutValidation.valid ? parseTokenAmount(minLpOutInput, 6) : BigInt(0)
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

  const handleAmountChange = (value: string, setter: (nextValue: string) => void, decimals: number) => {
    const sanitized = sanitizeTokenInput(value, decimals)
    if (sanitized !== null) {
      setAddLiquidityConfirmed(false)
      setter(sanitized)
    }
  }

  const refetchInputs = useCallback(() => {
    token0Balance.refetch()
    token1Balance.refetch()
    token0Allowance.refetch()
    token1Allowance.refetch()
    onRefreshPool()
  }, [token0Balance, token1Balance, token0Allowance, token1Allowance, onRefreshPool])

  const readAllowance = useCallback(async (tokenAddress: `0x${string}`) => {
    if (!publicClient || !address) return BigInt(0)
    const allowance = await publicClient.readContract({
      address: tokenAddress,
      abi: COCO_STABLE_ERC20_LIQUIDITY_ABI,
      functionName: 'allowance',
      args: [address, COCO_STABLE_POOL.poolAddress],
    })
    return allowance as bigint
  }, [address, publicClient])

  const confirmAllowance = useCallback(async (tokenAddress: `0x${string}`, requiredAmount: bigint) => {
    const allowance = await readAllowance(tokenAddress)
    refetchInputs()
    return allowance >= requiredAmount
  }, [readAllowance, refetchInputs])

  const getReceiptStatus = useCallback(async (txHash: `0x${string}`): Promise<ReceiptResult> => {
    if (!publicClient) return 'not_found'

    try {
      const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
      return receipt.status === 'success' ? 'success' : 'reverted'
    } catch {
      return 'not_found'
    }
  }, [publicClient])

  const waitForReceiptWithFallback = useCallback(async (txHash: `0x${string}`): Promise<ReceiptResult> => {
    if (!publicClient) return 'not_found'

    try {
      const receipt = await withTimeout(
        publicClient.waitForTransactionReceipt({ hash: txHash, pollingInterval: RECEIPT_POLL_INTERVAL_MS }),
        INITIAL_RECEIPT_WAIT_MS
      )
      if (receipt) return receipt.status === 'success' ? 'success' : 'reverted'
    } catch {
      // Fall through to direct receipt polling. Some RPCs miss wait subscriptions even after Arcscan has indexed the tx.
    }

    const startedAt = Date.now()
    while (Date.now() - startedAt < RECEIPT_TIMEOUT_MS) {
      const status = await getReceiptStatus(txHash)
      if (status === 'success' || status === 'reverted') return status
      await delay(RECEIPT_POLL_INTERVAL_MS)
    }

    return 'timeout'
  }, [getReceiptStatus, publicClient])

  const markStepSuccessFromChain = useCallback(async (step: TransactionType, txHash: `0x${string}`, requiredAmount?: bigint) => {
    if (step === 'approve_usdc') {
      if (requiredAmount === undefined) return false
      const allowanceConfirmed = await confirmAllowance(token0.address as `0x${string}`, requiredAmount)
      if (!allowanceConfirmed) {
        setTxError('USDC approval confirmed, but allowance is still below the entered amount. Click Check status or approve again.')
        return false
      }
    }

    if (step === 'approve_eurc') {
      if (requiredAmount === undefined) return false
      const allowanceConfirmed = await confirmAllowance(token1.address as `0x${string}`, requiredAmount)
      if (!allowanceConfirmed) {
        setTxError('EURC approval confirmed, but allowance is still below the entered amount. Click Check status or approve again.')
        return false
      }
    }

    if (step === 'add_liquidity') {
      setAddLiquidityConfirmed(true)
      setLastSuccessHash(txHash)
      refetchInputs()
    }

    setTimedOutSteps((prev) => ({ ...prev, [step]: false }))
    txProgress.markSuccess(step)
    return true
  }, [confirmAllowance, refetchInputs, token0.address, token1.address, txProgress])

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
    if (!amount0Validation.valid || !amount1Validation.valid || !minLpOutValidation.valid) return { action: 'enter', label: amount0Validation.error ?? amount1Validation.error ?? minLpOutValidation.error ?? 'Enter Amounts', disabled: true }
    if (balance0 !== undefined && amount0Raw > balance0) return { action: 'insufficient-usdc', label: 'Insufficient USDC', disabled: true }
    if (balance1 !== undefined && amount1Raw > balance1) return { action: 'insufficient-eurc', label: 'Insufficient EURC', disabled: true }
    if (isWalletPending || isStepWaitingForWallet) return { action: 'pending', label: 'Waiting for wallet', disabled: true }
    if (isStepConfirming) return { action: 'pending', label: 'Confirming on Arc Testnet', disabled: true }
    if (addLiquidityConfirmed) return { action: 'success', label: 'Confirmed', disabled: true }
    if (needsUsdcApproval) return { action: 'approve-usdc', label: 'Approve USDC', disabled: false }
    if (needsEurcApproval) return { action: 'approve-eurc', label: 'Approve EURC', disabled: false }
    return { action: 'add', label: 'Add Liquidity', disabled: false }
  }, [isConnected, address, chainId, paused, amount0Validation, amount1Validation, minLpOutValidation, balance0, balance1, amount0Raw, amount1Raw, isWalletPending, isStepWaitingForWallet, isStepConfirming, addLiquidityConfirmed, needsUsdcApproval, needsEurcApproval])

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
          if (isUserRejected(error)) {
            setTxError('Rejected by user')
            txProgress.markRejected(step)
          } else {
            setTxError(error.message)
            txProgress.markFailed(step, error.message)
          }
        },
      }
    )
  }, [ensureFlow, monitorTransaction, txProgress, writeContract])

  const handleAddLiquidity = useCallback(async () => {
    setTxError(null)
    setAddLiquidityConfirmed(false)

    if (!address || chainId !== ARC_CHAIN_ID || paused) return
    if (!amount0Validation.valid || !amount1Validation.valid || !minLpOutValidation.valid) return
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
      const message = error instanceof Error ? error.message : 'Add liquidity simulation failed'
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
          if (isUserRejected(error)) {
            setTxError('Rejected by user')
            txProgress.markRejected('add_liquidity')
          } else {
            setTxError(error.message)
            txProgress.markFailed('add_liquidity', error.message)
          }
        },
      }
    )
  }, [address, chainId, paused, amount0Validation.valid, amount1Validation.valid, minLpOutValidation.valid, balance0, balance1, amount0Raw, amount1Raw, minLpOutRaw, allowance0, allowance1, ensureFlow, txProgress, publicClient, writeContract, monitorTransaction])

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
    if (!txProgress.currentFlow) return

    try {
      setIsCheckingStatus(true)
      setTxError(null)

      for (const step of txProgress.currentFlow.steps) {
        if (!step.txHash || step.status === 'success' || step.status === 'failed' || step.status === 'rejected' || step.status === 'idle') continue
        const requiredAmount = step.type === 'approve_usdc'
          ? amount0Raw
          : step.type === 'approve_eurc'
            ? amount1Raw
            : undefined
        const status = await getReceiptStatus(step.txHash)

        if (status === 'success') {
          await markStepSuccessFromChain(step.type, step.txHash, requiredAmount)
          continue
        }

        if (status === 'reverted') {
          setTxError('Transaction reverted')
          txProgress.markFailed(step.type, 'Transaction reverted')
          continue
        }

        if ((step.type === 'approve_usdc' || step.type === 'approve_eurc') && requiredAmount !== undefined) {
          await markStepSuccessFromChain(step.type, step.txHash, requiredAmount)
        }
      }

      refetchInputs()
    } finally {
      setIsCheckingStatus(false)
    }
  }, [amount0Raw, amount1Raw, getReceiptStatus, markStepSuccessFromChain, refetchInputs, txProgress])

  const activeStepTimedOut = activeStep?.type ? timedOutSteps[activeStep.type] === true : false
  const showRecovery = !!activeTxHash && isStepConfirming

  return (
    <div className="mt-4 rounded-xl border border-blue-500/15 bg-coco-dark-bg/55 p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.18em] text-coco-teal-400">Arc Testnet only</p>
          <h4 className="mt-1 flex items-center gap-2 text-base font-semibold text-coco-dark-text">
            <Droplets className="h-4 w-4 text-coco-teal-400" />
            Add Liquidity
          </h4>
          <p className="mt-1 text-xs leading-relaxed text-coco-dark-muted">
            Uses exact approvals for the entered USDC and EURC amounts before calling CocoStablePool V1.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <LiquidityBadge>Arc Testnet only</LiquidityBadge>
          <LiquidityBadge>Prototype</LiquidityBadge>
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
          label="Min LP out"
          value={minLpOutInput}
          onChange={(value) => handleAmountChange(value, setMinLpOutInput, 6)}
          balance="cSLP, 6 decimals"
          error={minLpOutInput ? minLpOutValidation.error : null}
        />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 rounded-xl border border-coco-dark-border bg-coco-dark-surface/55 p-3 sm:grid-cols-2 lg:grid-cols-4">
        <InfoMetric label="Current USDC reserve" value={`${formatTokenAmount(reserve0, 6)} USDC`} />
        <InfoMetric label="Current EURC reserve" value={`${formatTokenAmount(reserve1, 6)} EURC`} />
        <InfoMetric label="LP recipient" value={address ? truncateAddress(address) : 'Connect wallet'} mono />
        <InfoMetric label="Estimated LP out" value={`${formatTokenAmount(estimatedLpOut, 6)} cSLP`} mono />
      </div>

      <div className="mt-3 rounded-lg border border-coco-amber-500/20 bg-coco-amber-500/10 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-coco-amber-500" />
          <p className="text-xs leading-relaxed text-coco-amber-500">
            CocoStablePool V1 is a testnet-only unaudited prototype. Start with tiny amounts. Initial liquidity and current pool size are tiny, USDC/EURC has FX/depeg risk, and this pool is not used by the smart router yet.
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
              Check status
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
}: {
  label: string
  value: string
  onChange: (value: string) => void
  balance: string
  error: string | null
}) {
  return (
    <label className="block rounded-xl border border-coco-dark-border bg-coco-dark-surface/70 p-3">
      <span className="text-xs text-coco-dark-muted">{label}</span>
      <input
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(event) => onChange(event.target.value)}
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
