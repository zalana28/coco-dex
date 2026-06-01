import { useWriteContract, useWaitForTransactionReceipt, useChainId, usePublicClient } from 'wagmi'
import { useState, useCallback } from 'react'
import { arcTestnet } from '@/config/chains'
import { SYNTHRA_QUOTE_FEE_TIERS, SYNTHRA_V3_SWAP_ROUTER_ADDRESS } from '@/config/synthra'
import type { Token } from '@/types/token'

const ARC_CHAIN_ID = arcTestnet.id

const SYNTHRA_V3_SWAP_ROUTER_ABI = [
  {
    type: 'function',
    name: 'exactInputSingle',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const

export type SynthraSwapParams = {
  tokenIn: Token
  tokenOut: Token
  amountIn: bigint
  minAmountOut: bigint
  feeTier: number
  account: `0x${string}`
  to: `0x${string}`
}

type SynthraSwapResult =
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
  if (typeof walk !== 'function') return stringifyErrorField(getErrorField(error, 'reason'))

  const reasonError = walk.call(error, (value: unknown) => Boolean(getErrorField(value, 'reason')))
  return stringifyErrorField(getErrorField(reasonError, 'reason'))
}

function classifySynthraSimulationError(error: unknown): string {
  const cause = getErrorField(error, 'cause')
  const metaMessages = getErrorField(error, 'metaMessages')
  const combined = [
    stringifyErrorField(getErrorField(error, 'name')),
    stringifyErrorField(getErrorField(error, 'shortMessage')),
    stringifyErrorField(getErrorField(error, 'details')),
    Array.isArray(metaMessages) ? metaMessages.map(String).join(' ') : undefined,
    stringifyErrorField(getErrorField(cause, 'shortMessage')),
    getNestedRevertReason(error),
    error instanceof Error ? error.message : stringifyErrorField(error),
  ].filter(Boolean).join(' ')
  const normalized = combined.toLowerCase()

  if (normalized.includes('stf') || normalized.includes('allowance') || normalized.includes('insufficient allowance') || normalized.includes('transfer amount exceeds allowance')) {
    return 'Insufficient allowance for Synthra router'
  }
  if (normalized.includes('insufficient balance') || normalized.includes('transfer amount exceeds balance') || normalized.includes('exceeds balance')) {
    return 'Insufficient balance'
  }
  if (normalized.includes('too little received') || normalized.includes('minimum') || normalized.includes('slippage')) {
    return 'Min received too high'
  }
  if (normalized.includes('execution reverted') || normalized.includes('reverted')) {
    return 'Synthra router reverted'
  }

  const fallback = stringifyErrorField(getErrorField(error, 'shortMessage'))
    ?? stringifyErrorField(getErrorField(error, 'details'))
    ?? getNestedRevertReason(error)
  return fallback ? `Synthra simulation failed: ${fallback}` : 'Synthra simulation failed'
}

function isSupportedFeeTier(feeTier: number): feeTier is (typeof SYNTHRA_QUOTE_FEE_TIERS)[number] {
  return SYNTHRA_QUOTE_FEE_TIERS.includes(feeTier as (typeof SYNTHRA_QUOTE_FEE_TIERS)[number])
}

export function useSynthraSwap() {
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
    params: SynthraSwapParams,
    onHash?: (hash: `0x${string}`) => void,
  ): Promise<SynthraSwapResult | undefined> => {
    if (chainId !== ARC_CHAIN_ID) {
      console.warn('[useSynthraSwap] BLOCKED: wallet is on wrong network', chainId)
      return { status: 'WRONG_NETWORK', reason: 'Wrong network' }
    }

    setSimulationError(undefined)

    if (!publicClient) {
      const reason = 'Synthra simulation failed: RPC client unavailable'
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    const { tokenIn, tokenOut, amountIn, minAmountOut, feeTier, account, to } = params
    if (!isSupportedFeeTier(feeTier)) {
      const reason = `Synthra simulation failed: unsupported fee tier ${feeTier}`
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }
    if (amountIn <= BigInt(0) || minAmountOut <= BigInt(0)) {
      const reason = 'Synthra simulation failed: invalid quote amounts'
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    const swapArgs = [{
      tokenIn: tokenIn.address as `0x${string}`,
      tokenOut: tokenOut.address as `0x${string}`,
      fee: feeTier,
      recipient: to,
      amountIn,
      amountOutMinimum: minAmountOut,
      sqrtPriceLimitX96: BigInt(0),
    }] as const

    try {
      await publicClient.simulateContract({
        address: SYNTHRA_V3_SWAP_ROUTER_ADDRESS,
        abi: SYNTHRA_V3_SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: swapArgs,
        account,
        chain: arcTestnet,
      })
    } catch (simErr: unknown) {
      const reason = classifySynthraSimulationError(simErr)
      setSimulationError(reason)
      return { status: 'SIMULATION_FAILED', reason }
    }

    writeContract(
      {
        address: SYNTHRA_V3_SWAP_ROUTER_ADDRESS,
        abi: SYNTHRA_V3_SWAP_ROUTER_ABI,
        functionName: 'exactInputSingle',
        args: swapArgs,
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
