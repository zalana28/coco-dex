import { useWriteContract, useWaitForTransactionReceipt, useChainId, usePublicClient } from 'wagmi'
import { useState, useCallback } from 'react'
import { decodeAbiParameters, type Hex } from 'viem'
import { XYLONET_ROUTER_ABI } from '@/lib/router/xylonetAdapter'
import { XYLONET_ROUTER_ADDRESS, XYLONET_USDC_EURC_POOL_ADDRESS } from '@/config/externalDexes'
import { ERC20_ABI } from '@/config/abis'
import { arcTestnet } from '@/config/chains'
import type { Token } from '@/types/token'
import {
  hasStateMoved,
  SIMULATION_STATE_MOVED_REASON,
  tryGetBlockNumber,
  trySimulate,
} from '@/lib/router/swapSimulation'

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
  | { status: 'ALLOWANCE_INSUFFICIENT'; reason: string; allowance: bigint; amountIn: bigint; spender: string }

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
  const walk = getErrorField(error, 'walk')
  if (typeof walk === 'function') {
    const reasonError = walk.call(error, (value: unknown) => Boolean(getErrorField(value, 'reason')))
    const reason = stringifyErrorField(getErrorField(reasonError, 'reason'))
    if (reason) return reason
  }
  const direct = stringifyErrorField(getErrorField(error, 'reason'))
  if (direct) return direct
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

  if (n.includes('429') || n.includes('rate limit') || n.includes('too many requests'))
    return 'RPC rate limit reached — wait a moment and try again'

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

  if (n.includes('allowance') || n.includes('transfer amount exceeds allowance'))
    return 'Insufficient allowance — approve XyloNet router first'

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

async function decodeRevertReason(publicClient: NonNullable<ReturnType<typeof usePublicClient>>, txHash: `0x${string}`): Promise<string | undefined> {
  try {
    const receipt = await publicClient.getTransactionReceipt({ hash: txHash })
    if (receipt.status !== 'reverted') return undefined
    const tx = await publicClient.getTransaction({ hash: txHash })
    if (!tx) return undefined
    try {
      const reason = await publicClient.call({
        to: tx.to ?? undefined,
        data: tx.input as Hex,
        account: tx.from,
        gas: tx.gas,
        gasPrice: tx.gasPrice ?? undefined,
        value: tx.value,
        blockNumber: receipt.blockNumber,
      })
      if (reason.data && reason.data !== '0x') {
        const decoded = decodeRevertData(reason.data as Hex)
        if (decoded) return decoded
      }
    } catch {
      // inner call failed — fall through to generic message
    }
    return `Transaction reverted at block ${receipt.blockNumber}`
  } catch {
    return undefined
  }
}

function decodeRevertData(data: Hex): string | undefined {
  if (data === '0x' || !data || data.length < 10) return undefined
  const errorSig = data.slice(0, 10).toLowerCase() as Hex
  const errorTypes: Record<string, { types: string[]; label: string }> = {
    '0x08c379a0': { types: ['string'], label: 'Error(string)' },
    '0x4e487b71': { types: ['uint256'], label: 'Panic(uint256)' },
  }
  const entry = errorTypes[errorSig]
  if (entry) {
    try {
      const params = decodeAbiParameters(
        entry.types.map(t => ({ type: t })),
        `0x${data.slice(10)}` as Hex,
      )
      return `${entry.label}: ${params.join(', ')}`
    } catch {
      return `Revert with selector ${errorSig}`
    }
  }
  return `Revert with custom error selector ${errorSig}`
}

export function useXyloNetSwap() {
  const chainId = useChainId()
  const publicClient = usePublicClient({ chainId: ARC_CHAIN_ID })
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>()
  const [simulationError, setSimulationError] = useState<string | undefined>()
  const [revertReason, setRevertReason] = useState<string | undefined>()
  const { writeContract, isPending, error, reset: resetWrite } = useWriteContract()
  const { isLoading: isConfirming, isSuccess, data: swapReceipt } = useWaitForTransactionReceipt({
    hash: txHash,
    query: { enabled: !!txHash },
  })

  const isReverted = swapReceipt?.status === 'reverted'
  const clearSimulationError = useCallback(() => { setSimulationError(undefined); setRevertReason(undefined) }, [])

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
    setRevertReason(undefined)

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
    // a fresh quote + slippage via calculateMinimumReceived(amountOut, slippageBps).
    // The canonical formula: amountOutMin = (quotedAmountOut * (10_000 - slippageBps)) / 10_000.
    // No additional buffer — the user's slippage setting is the sole minimum.
    const spender = XYLONET_ROUTER_ADDRESS

    // ─── Step 1: Read allowance FRESH from chain (no cache) ───
    let allowance: bigint
    try {
      const raw = await publicClient.readContract({
        address: tokenIn.address as `0x${string}`,
        abi: ERC20_ABI,
        functionName: 'allowance',
        args: [account, spender],
      })
      allowance = raw as bigint
    } catch {
      const reason = 'Failed to read token allowance — RPC issue, try again'
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    if (allowance < amountIn) {
      const reason = `Insufficient allowance: have ${allowance.toString()}, need ${amountIn.toString()} — approve XyloNet router first`
      if (import.meta.env.DEV) {
        console.warn('[useXyloNetSwap] ALLOWANCE INSUFFICIENT', {
          token: tokenIn.address, spender, allowance: allowance.toString(), amountIn: amountIn.toString(),
        })
      }
      setSimulationError(reason)
      return {
        status: 'ALLOWANCE_INSUFFICIENT',
        reason,
        allowance,
        amountIn,
        spender,
      }
    }

    if (import.meta.env.DEV) {
      console.debug('[useXyloNetSwap] allowance fresh:', {
        token: tokenIn.address, spender, allowance: allowance.toString(), amountIn: amountIn.toString(),
      })
    }

    const swapArgs = [amountIn, minAmountOut, path, to, deadlineSeconds] as const

    // ─── Step 2: Record the block the simulation is about to run against ───
    // Read before simulating, so it genuinely describes the state the
    // simulation saw rather than whatever block arrived afterwards.
    const simBlockNumber = await tryGetBlockNumber(() => publicClient.getBlockNumber())

    if (import.meta.env.DEV) {
      console.debug('[useXyloNetSwap] swap args:', {
        router: XYLONET_ROUTER_ADDRESS,
        spender,
        path,
        amountIn: amountIn.toString(),
        minAmountOut: minAmountOut.toString(),
        slippageBps,
        deadlineSeconds: deadlineSeconds.toString(),
        account,
        recipient: to,
        allowance: allowance.toString(),
      })
    }

    // ─── Step 3: Simulate, and keep the prepared request ───
    const simulation = await trySimulate(() => publicClient.simulateContract({
        address: XYLONET_ROUTER_ADDRESS,
        abi: XYLONET_ROUTER_ABI,
        functionName: 'swapExactTokensForTokens',
        args: swapArgs,
        account,
        chain: arcTestnet,
      }))
    if (!simulation.ok) {
      const reason = classifyXyloNetSimulationError(simulation.error)
      if (import.meta.env.DEV) console.debug('[useXyloNetSwap] simulation failed:', { reason })
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }
      if (import.meta.env.DEV) console.debug('[useXyloNetSwap] simulation passed at block', simBlockNumber?.toString())

    // ─── Step 4: Reject if chain state moved since the simulation ───
    // This replaces a fingerprint comparison that could never fail: both sides
    // were built from the same unchanged local consts within one callback, so
    // they always matched. Block height is a real signal — reserves and
    // allowances can move underneath a simulation that has already passed.
    const blockBeforeWrite = await tryGetBlockNumber(() => publicClient.getBlockNumber())
    if (hasStateMoved(simBlockNumber, blockBeforeWrite)) {
      const reason = SIMULATION_STATE_MOVED_REASON
      if (import.meta.env.DEV) {
        console.warn('[useXyloNetSwap] block drift', {
          simBlockNumber: simBlockNumber?.toString(),
          nowBlock: blockBeforeWrite?.toString(),
        })
      }
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    // ─── Step 5: Submit the simulated request ───
    // Passing `request` rather than hand-built args carries the validated
    // arguments *and* the gas limit viem derived. Rebuilding them made the
    // wallet re-run eth_estimateGas against the user's own RPC — a different
    // node, with a different view of state and none of the app's retry config.
    writeContract(
      simulation.value.request,
      {
        onSuccess: async (hash) => {
          if (import.meta.env.DEV) console.log('[useXyloNetSwap] tx sent:', hash)
          setTxHash(hash)
          onHash?.(hash)
        },
        onError: (err) => {
          if (import.meta.env.DEV) console.error('[useXyloNetSwap] writeContract error:', err.message?.slice(0, 200))
          const errMsg = err.message || ''
          if (errMsg.toLowerCase().includes('revert') || errMsg.toLowerCase().includes('execution reverted')) {
            setSimulationError('XyloNet swap reverted on-chain')
          }
        },
      },
    )
    return undefined
  }, [writeContract, chainId, publicClient])

  // ─── Decode revert reason when receipt reverts ───
  const decodeReceiptRevert = useCallback(async () => {
    if (!txHash || !publicClient) return
    const reason = await decodeRevertReason(publicClient, txHash)
    if (reason) setRevertReason(reason)
  }, [txHash, publicClient])

  const resetSwap = useCallback(() => {
    setTxHash(undefined)
    setSimulationError(undefined)
    setRevertReason(undefined)
    resetWrite()
  }, [resetWrite])

  return {
    swap, isPending, isConfirming, isSuccess, isReverted,
    txHash, error, simulationError, revertReason, decodeReceiptRevert,
    clearSimulationError, reset: resetSwap,
  }
}
