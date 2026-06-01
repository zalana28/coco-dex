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

type ViemErrorDetails = {
  name?: string
  shortMessage?: string
  details?: string
  metaMessages?: string[]
  causeReason?: string
  message?: string
}

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
  if (typeof walk !== 'function') return stringifyErrorField(getErrorField(error, 'reason'))

  const reasonError = walk.call(error, (value: unknown) => Boolean(getErrorField(value, 'reason')))
  return stringifyErrorField(getErrorField(reasonError, 'reason'))
}

function getViemErrorDetails(error: unknown): ViemErrorDetails {
  const metaMessages = getErrorField(error, 'metaMessages')

  return {
    name: stringifyErrorField(getErrorField(error, 'name')),
    shortMessage: stringifyErrorField(getErrorField(error, 'shortMessage')),
    details: stringifyErrorField(getErrorField(error, 'details')),
    metaMessages: Array.isArray(metaMessages) ? metaMessages.map(String) : undefined,
    causeReason: getNestedRevertReason(error),
    message: error instanceof Error ? error.message : stringifyErrorField(error),
  }
}

function classifyUnitFlowSimulationError(error: unknown): string {
  const details = getViemErrorDetails(error)
  const fallback = details.shortMessage ?? details.details ?? details.causeReason ?? details.message
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
  return encodeAbiParameters(parseAbiParameters('address token, address recipient, uint256 amountMin'), [token, recipient, amountMin])
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

  const clearSimulationError = useCallback(() => {
    setSimulationError(undefined)
  }, [])

  const swap = useCallback(async (
    params: UnitFlowSwapParams,
    onHash?: (hash: `0x${string}`) => void,
  ): Promise<UnitFlowSwapResult | undefined> => {
    if (chainId !== ARC_CHAIN_ID) {
      console.warn('[useUnitFlowSwap] BLOCKED: wallet is on wrong network', chainId)
      return { status: 'WRONG_NETWORK', reason: 'Wrong network' }
    }

    setSimulationError(undefined)

    if (!publicClient) {
      const reason = 'UnitFlow simulation failed: RPC client unavailable'
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    const { amountIn, minAmountOut, account, to, deadlineMinutes } = params
    const nativeAmountIn = amountIn * WUSDC_DECIMAL_SCALE
    const safeDeadlineMinutes = Number.isFinite(deadlineMinutes) && deadlineMinutes > 0
      ? deadlineMinutes
      : DEFAULT_DEADLINE_MINUTES
    const latestBlock = await publicClient.getBlock({ blockTag: 'latest' })
    const deadlineSeconds = latestBlock.timestamp + BigInt(Math.ceil(safeDeadlineMinutes * 60))
    const inputs = buildUnitFlowInputs(amountIn, minAmountOut, to)

    if (minAmountOut <= BigInt(0)) {
      const reason = 'UnitFlow simulation failed: invalid min received'
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    if (import.meta.env.DEV) {
      console.debug('[useUnitFlowSwap] UniversalRouter swap args:', {
        commands: UNITFLOW_COMMANDS,
        amountIn: amountIn.toString(),
        nativeAmountIn: nativeAmountIn.toString(),
        minAmountOut: minAmountOut.toString(),
        path: [UNITFLOW_WUSDC_ADDRESS, EURC.address],
        account,
        recipient: to,
        deadlineSeconds: deadlineSeconds.toString(),
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
    } catch (simErr: unknown) {
      const reason = classifyUnitFlowSimulationError(simErr)
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
          setTxHash(hash)
          onHash?.(hash)
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
    swap,
    isPending,
    isConfirming,
    isSuccess,
    isReverted,
    txHash,
    error,
    simulationError,
    clearSimulationError,
    reset: resetSwap,
  }
}
