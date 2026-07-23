import { useWriteContract, useWaitForTransactionReceipt, useChainId, usePublicClient } from 'wagmi'
import { useState, useCallback } from 'react'
import { XYLONET_ROUTER_ABI } from '@/lib/router/xylonetAdapter'
import { XYLONET_ROUTER_ADDRESS, XYLONET_USDC_EURC_POOL_ADDRESS } from '@/config/externalDexes'
import { arcTestnet } from '@/config/chains'
import type { Token } from '@/types/token'

const ARC_CHAIN_ID = arcTestnet.id
const DEFAULT_DEADLINE_MINUTES = 5

export type XyloNetSwapParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  /** minAmountOut already computed by the aggregator from fresh quote + slippage. */
  minAmountOut: bigint
  slippageBps: number
  account: `0x${string}`
  to: `0x${string}`
  deadlineMinutes: number
}

type XyloNetSwapResult =
  | { status: 'WRONG_NETWORK'; reason: string }
  | { status: 'SIMULATION_FAILED'; reason: string }

function getErrorField(error: unknown, field: string): unknown {
  if (!error || typeof error !== 'object') return undefined
  return (error as Record<string, unknown>)[field]
}

function stringifyErrorField(value: unknown): string | undefined {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return undefined
}

function getNestedRevertReason(error: unknown): string | undefined {
  // Walk the cause chain to find a revert reason.
  const walk = getErrorField(error, 'walk')
  if (typeof walk === 'function') {
    const reasonError = walk.call(error, (value: unknown) => Boolean(getErrorField(value, 'reason')))
    const reason = stringifyErrorField(getErrorField(reasonError, 'reason'))
    if (reason) return reason
  }
  // Direct reason field
  const direct = stringifyErrorField(getErrorField(error, 'reason'))
  if (direct) return direct
  // Walk cause chain manually
  let cause: unknown = getErrorField(error, 'cause')
  for (let i = 0; i < 5 && cause; i++) {
    const r = stringifyErrorField(getErrorField(cause, 'reason'))
    if (r) return r
    const msg = stringifyErrorField(getErrorField(cause, 'shortMessage')) ?? stringifyErrorField(getErrorField(cause, 'message'))
    if (msg && (msg.toLowerCase().includes('reverted') || msg.toLowerCase().includes('revert'))) return msg
    cause = getErrorField(cause, 'cause')
  }
  return undefined
}

function classifyXyloNetSimulationError(error: unknown): string {
  const cause = getErrorField(error, 'cause')
  const metaMessages = getErrorField(error, 'metaMessages')
  const name = stringifyErrorField(getErrorField(error, 'name')) ?? ''
  const shortMessage = stringifyErrorField(getErrorField(error, 'shortMessage')) ?? ''
  const details = stringifyErrorField(getErrorField(error, 'details')) ?? ''
  const metaMsgs = Array.isArray(metaMessages) ? metaMessages.map(String).join(' ') : ''
  const causeShort = stringifyErrorField(getErrorField(cause, 'shortMessage')) ?? ''
  const revertReason = getNestedRevertReason(error) ?? ''
  const rawMessage = error instanceof Error ? error.message : stringifyErrorField(error) ?? ''

  // Always log in DEV — helps diagnose misclassification without touching user message.
  if (import.meta.env.DEV) {
    console.debug('[useXyloNetSwap] classifyError:', {
      router: XYLONET_ROUTER_ADDRESS,
      pool: XYLONET_USDC_EURC_POOL_ADDRESS,
      chainId: ARC_CHAIN_ID,
      name, shortMessage, details, metaMsgs, causeShort, revertReason, rawMessage,
      fullError: error,
    })
  }

  const combined = [name, shortMessage, details, metaMsgs, causeShort, revertReason, rawMessage].join(' ')
  const n = combined.toLowerCase()

  // ── Rate limit / connectivity ────────────────────────────────────────────
  if (n.includes('429') || n.includes('rate limit') || n.includes('too many requests'))
    return 'RPC rate limit reached — wait a moment and try again'

  // ── Revert reasons (check BEFORE generic HTTP/network strings because
  //    ContractFunctionExecutionError message chain may include those) ───────
  if (revertReason) {
    const r = revertReason.toLowerCase()
    if (r.includes('allowance') || r.includes('transfer amount exceeds allowance'))
      return 'Insufficient allowance — approve XyloNet router first'
    if (r.includes('insufficient_output') || r.includes('insufficient output'))
      return 'Slippage too low — increase slippage tolerance'
    if (r.includes('insufficient balance') || r.includes('exceeds balance'))
      return 'Insufficient token balance'
    if (r.includes('expired')) return 'Transaction deadline expired — try again'
    return `Swap reverted: ${revertReason}`
  }

  if (n.includes('execution reverted') || n.includes('reverted')) {
    if (n.includes('allowance') || n.includes('transfer amount exceeds allowance'))
      return 'Insufficient allowance — approve XyloNet router first'
    if (n.includes('insufficient_output') || n.includes('insufficient output'))
      return 'Slippage too low — increase slippage tolerance'
    if (n.includes('insufficient balance') || n.includes('exceeds balance'))
      return 'Insufficient token balance'
    if (n.includes('expired')) return 'Transaction deadline expired — try again'
    const reason = details || causeShort || shortMessage
    return reason ? `Swap reverted: ${reason}` : 'Swap simulation reverted'
  }

  // ── Allowance without explicit revert wrapper ────────────────────────────
  if (n.includes('allowance') || n.includes('transfer amount exceeds allowance'))
    return 'Insufficient allowance — approve XyloNet router first'

  // ── Network / RPC errors (only after ruling out reverts) ─────────────────
  if (n.includes('http request failed') || n.includes('rpc request failed') || n.includes('fetch failed'))
    return 'RPC unavailable — check your connection and try again'
  if (n.includes('timeout') || n.includes('timed out'))
    return 'RPC request timed out — try again'

  if (n.includes('insufficient_output') || n.includes('insufficient output'))
    return 'Slippage too low — increase slippage tolerance'
  if (n.includes('insufficient balance') || n.includes('exceeds balance'))
    return 'Insufficient token balance'
  if (/\bexpired\b/i.test(combined) || combined.includes('EXPIRED'))
    return 'Transaction deadline expired — try again'
  if (n.includes('too little received') || n.includes('minimum') || n.includes('slippage'))
    return 'Min received too high — increase slippage tolerance'

  const fallback = shortMessage || causeShort || details || revertReason || rawMessage
  return fallback ? `XyloNet simulation failed: ${fallback}` : 'XyloNet simulation failed'
}

export function useXyloNetSwap() {
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [simulationError, setSimulationError] = useState<string | undefined>()
  const { writeContract, isPending, error, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: swapReceipt } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  })

  const isReverted = swapReceipt?.status === 'reverted'
  const clearSimulationError = useCallback(() => setSimulationError(undefined), [])

  const swap = useCallback(async (
    params: XyloNetSwapParams,
    onHash?: (hash: `0x${string}`) => void,
  ): Promise<XyloNetSwapResult | undefined> => {
    if (chainId !== ARC_CHAIN_ID) {
      console.warn('[useXyloNetSwap] BLOCKED: wrong network', chainId)
      return { status: 'WRONG_NETWORK', reason: 'Wrong network — switch to Arc Testnet' }
    }

    const { tokenIn, tokenOut, amountIn, minAmountOut, slippageBps, account, to, deadlineMinutes } = params
    setSimulationError(undefined)

    if (!publicClient) {
      const reason = 'RPC client unavailable — reload and try again'
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    if (amountIn <= 0n || minAmountOut <= 0n) {
      const reason = 'Invalid swap amounts — refresh quote and try again'
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    const safeDeadlineMinutes = Number.isFinite(deadlineMinutes) && deadlineMinutes > 0
      ? deadlineMinutes : DEFAULT_DEADLINE_MINUTES
    const deadlineSeconds = BigInt(Math.floor(Date.now() / 1000)) + BigInt(Math.ceil(safeDeadlineMinutes * 60))
    const path = [tokenIn.address as `0x${string}`, tokenOut.address as `0x${string}`] as const

    // Use the aggregator-computed minAmountOut directly — it already incorporates
    // a fresh quote + slippage. Skipping an extra readContract(getAmountOut) here
    // saves one RPC round-trip and avoids 429 cascades.
    const safeSlippageBps = BigInt(Math.min(10_000, Math.max(0, Math.trunc(slippageBps))))
    const execMinAmountOut = minAmountOut - (minAmountOut * safeSlippageBps) / 20_000n // extra 0.5× buffer

    const swapArgs = [amountIn, execMinAmountOut, path, to, deadlineSeconds] as const

    if (import.meta.env.DEV) {
      console.debug('[useXyloNetSwap] swap args:', {
        router: XYLONET_ROUTER_ADDRESS,
        pool: XYLONET_USDC_EURC_POOL_ADDRESS,
        chainId: ARC_CHAIN_ID,
        path,
        amountIn: amountIn.toString(),
        minAmountOut: minAmountOut.toString(),
        execMinAmountOut: execMinAmountOut.toString(),
        slippageBps,
        deadlineSeconds: deadlineSeconds.toString(),
        account,
        recipient: to,
      })
    }

    try {
      await publicClient.simulateContract({
        address: XYLONET_ROUTER_ADDRESS,
        abi: XYLONET_ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: swapArgs,
        account,
        chain: arcTestnet,
      })
      if (import.meta.env.DEV) console.debug('[useXyloNetSwap] simulation passed')
    } catch (simErr: unknown) {
      const reason = classifyXyloNetSimulationError(simErr)
      if (import.meta.env.DEV) console.debug('[useXyloNetSwap] simulation failed:', { reason })
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    writeContract(
      {
        address: XYLONET_ROUTER_ADDRESS,
        abi: XYLONET_ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: swapArgs,
        chainId: ARC_CHAIN_ID,
      },
      {
        onSuccess: (hash) => {
          if (import.meta.env.DEV) console.log('[useXyloNetSwap] tx sent:', hash)
          setTxHash(hash)
          onHash?.(hash)
        },
        onError: (err) => {
          if (import.meta.env.DEV) console.error('[useXyloNetSwap] writeContract error:', err.message?.slice(0, 200))
          const errMsg = err.message || ''
          if (errMsg.toLowerCase().includes('revert') || errMsg.toLowerCase().includes('execution reverted'))
            setSimulationError('XyloNet swap reverted on-chain')
        },
      },
    )
    return undefined
  }, [writeContract, chainId, publicClient])

  const resetSwap = useCallback(() => {
    setTxHash(undefined)
    setSimulationError(undefined)
    resetWrite()
  }, [resetWrite])

  return {
    swap, isPending, isConfirming, isSuccess, isReverted,
    txHash, error, simulationError, clearSimulationError, reset: resetSwap,
  }
}
