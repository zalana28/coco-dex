import { useWriteContract, useWaitForTransactionReceipt, useChainId, usePublicClient } from 'wagmi'
import { useCallback, useState } from 'react'
import { encodeAbiParameters, parseAbiParameters, type Hex } from 'viem'
import { arcTestnet } from '@/config/chains'
import { EURC } from '@/config/tokens'
import { UNITFLOW_UNIVERSAL_ROUTER_ADDRESS, UNITFLOW_WUSDC_ADDRESS } from '@/config/unitflow'

const ARC_CHAIN_ID = arcTestnet.id
const DEFAULT_DEADLINE_MINUTES = 5
const WUSDC_DECIMAL_SCALE = 1_000_000_000_000n

const UNITFLOW_UNIVERSAL_ROUTER_ABI = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const

const UNITFLOW_COMMANDS: Hex = '0x0b0804'

export type UnitFlowSwapParams = {
  amountIn: bigint
  minAmountOut: bigint
  account: `0x${string}`
  to: `0x${string}`
  deadlineMinutes: number
}

type UnitFlowSwapResult =
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
  const walk = getErrorField(error, 'walk')
  if (typeof walk === 'function') {
    const re = walk.call(error, (v: unknown) => Boolean(getErrorField(v, 'reason')))
    const r = stringifyErrorField(getErrorField(re, 'reason'))
    if (r) return r
  }
  const direct = stringifyErrorField(getErrorField(error, 'reason'))
  if (direct) return direct
  let cause: unknown = getErrorField(error, 'cause')
  for (let i = 0; i < 5 && cause; i++) {
    const r = stringifyErrorField(getErrorField(cause, 'reason'))
    if (r) return r
    cause = getErrorField(cause, 'cause')
  }
  return undefined
}

function classifyUnitFlowSimulationError(error: unknown): string {
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
    console.debug('[useUnitFlowSwap] classifyError:', {
      router: UNITFLOW_UNIVERSAL_ROUTER_ADDRESS, chainId: ARC_CHAIN_ID,
      name, shortMessage, details, causeShort, revertReason, rawMessage,
    })
  }

  const combined = [name, shortMessage, details, metaMsgs, causeShort, revertReason, rawMessage].join(' ')
  const n = combined.toLowerCase()

  if (n.includes('429') || n.includes('rate limit') || n.includes('too many requests'))
    return 'RPC rate limit reached — wait a moment and try again'

  if (revertReason) {
    const r = revertReason.toLowerCase()
    if (r.includes('allowance') || r.includes('transfer amount exceeds allowance'))
      return 'Insufficient allowance for UnitFlow router'
    if (r.includes('insufficient balance') || r.includes('exceeds balance'))
      return 'Insufficient balance'
    if (r.includes('expired')) return 'Transaction deadline expired — try again'
    return `UnitFlow reverted: ${revertReason}`
  }

  if (n.includes('execution reverted') || n.includes('reverted')) {
    if (n.includes('allowance') || n.includes('transfer amount exceeds allowance'))
      return 'Insufficient allowance for UnitFlow router'
    if (n.includes('insufficient balance') || n.includes('exceeds balance'))
      return 'Insufficient balance'
    const reason = details || causeShort || shortMessage
    return reason ? `UnitFlow reverted: ${reason}` : 'UnitFlow simulation reverted'
  }

  if (n.includes('allowance') || n.includes('insufficient allowance'))
    return 'Insufficient allowance for UnitFlow router'
  if (n.includes('http request failed') || n.includes('rpc request failed') || n.includes('fetch failed'))
    return 'RPC unavailable — check your connection and try again'
  if (n.includes('timeout') || n.includes('timed out'))
    return 'RPC request timed out — try again'
  if (n.includes('insufficient balance') || n.includes('exceeds balance'))
    return 'Insufficient balance'
  if (n.includes('minimum') || n.includes('slippage') || n.includes('too little received'))
    return 'Min received too high — increase slippage tolerance'

  const fallback = shortMessage || causeShort || details || revertReason || rawMessage
  return fallback ? `UnitFlow simulation failed: ${fallback}` : 'UnitFlow simulation failed'
}

function encodeWrapInput(recipient: `0x${string}`, amountMin: bigint): Hex {
  return encodeAbiParameters(parseAbiParameters('address recipient, uint256 amountMin'), [recipient, amountMin])
}

function encodeV2SwapExactInInput(
  recipient: `0x${string}`,
  amountIn: bigint,
  amountOutMin: bigint,
  path: readonly [`0x${string}`, `0x${string}`],
): Hex {
  return encodeAbiParameters(
    parseAbiParameters('address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser'),
    [recipient, amountIn, amountOutMin, [...path], false],
  )
}

function encodeSweepInput(token: `0x${string}`, recipient: `0x${string}`, amountMin: bigint): Hex {
  return encodeAbiParameters(
    parseAbiParameters('address token, address recipient, uint256 amountMin'),
    [token, recipient, amountMin],
  )
}

function buildUnitFlowInputs(amountIn: bigint, minAmountOut: bigint, recipient: `0x${string}`): readonly Hex[] {
  const nativeAmountIn = amountIn * WUSDC_DECIMAL_SCALE
  const path = [UNITFLOW_WUSDC_ADDRESS, EURC.address as `0x${string}`] as const
  return [
    encodeWrapInput(UNITFLOW_UNIVERSAL_ROUTER_ADDRESS, nativeAmountIn),
    encodeV2SwapExactInInput(UNITFLOW_UNIVERSAL_ROUTER_ADDRESS, nativeAmountIn, minAmountOut, path),
    encodeSweepInput(EURC.address as `0x${string}`, recipient, minAmountOut),
  ]
}

export function useUnitFlowSwap() {
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
    params: UnitFlowSwapParams,
    onHash?: (hash: `0x${string}`) => void,
  ): Promise<UnitFlowSwapResult | undefined> => {
    if (chainId !== ARC_CHAIN_ID) {
      console.warn('[useUnitFlowSwap] BLOCKED: wrong network', chainId)
      return { status: 'WRONG_NETWORK', reason: 'Wrong network — switch to Arc Testnet' }
    }

    setSimulationError(undefined)

    if (!publicClient) {
      const reason = 'RPC client unavailable — reload and try again'
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    const { amountIn, minAmountOut, account, to, deadlineMinutes } = params
    const nativeAmountIn = amountIn * WUSDC_DECIMAL_SCALE
    const safeDeadlineMinutes = Number.isFinite(deadlineMinutes) && deadlineMinutes > 0
      ? deadlineMinutes : DEFAULT_DEADLINE_MINUTES
    const deadlineSeconds = BigInt(Math.floor(Date.now() / 1000)) + BigInt(Math.ceil(safeDeadlineMinutes * 60))

    if (minAmountOut <= 0n) {
      const reason = 'UnitFlow simulation failed: invalid min received'
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    const inputs = buildUnitFlowInputs(amountIn, minAmountOut, to)

    if (import.meta.env.DEV) {
      console.debug('[useUnitFlowSwap] swap args:', {
        router: UNITFLOW_UNIVERSAL_ROUTER_ADDRESS, chainId: ARC_CHAIN_ID,
        commands: UNITFLOW_COMMANDS,
        amountIn: amountIn.toString(), nativeAmountIn: nativeAmountIn.toString(),
        minAmountOut: minAmountOut.toString(), deadlineSeconds: deadlineSeconds.toString(),
        account, recipient: to,
      })
    }

    try {
      await publicClient.simulateContract({
        address: UNITFLOW_UNIVERSAL_ROUTER_ADDRESS,
        abi: UNITFLOW_UNIVERSAL_ROUTER_ABI,
        functionName: 'execute',
        args: [UNITFLOW_COMMANDS, [...inputs], deadlineSeconds],
        account,
        value: nativeAmountIn,
        chain: arcTestnet,
      })
      if (import.meta.env.DEV) console.debug('[useUnitFlowSwap] simulation passed')
    } catch (simErr: unknown) {
      const reason = classifyUnitFlowSimulationError(simErr)
      if (import.meta.env.DEV) console.debug('[useUnitFlowSwap] simulation failed:', { reason })
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    writeContract(
      {
        address: UNITFLOW_UNIVERSAL_ROUTER_ADDRESS,
        abi: UNITFLOW_UNIVERSAL_ROUTER_ABI,
        functionName: 'execute',
        args: [UNITFLOW_COMMANDS, [...inputs], deadlineSeconds],
        value: nativeAmountIn,
        chainId: ARC_CHAIN_ID,
      },
      {
        onSuccess: (hash) => {
          if (import.meta.env.DEV) console.log('[useUnitFlowSwap] tx sent:', hash)
          setTxHash(hash)
          onHash?.(hash)
        },
        onError: (err) => {
          if (import.meta.env.DEV) console.error('[useUnitFlowSwap] writeContract error:', err.message?.slice(0, 200))
        },
      },
    )
    return undefined
  }, [chainId, publicClient, writeContract])

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
