import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { useState, useCallback } from 'react'
import { arcTestnet } from '@/config/chains'

type SwitchState = 'idle' | 'switching' | 'adding' | 'success' | 'rejected' | 'error'

type EthereumRequest = {
  method: string
  params?: unknown[]
}

type EthereumProvider = {
  request?: (request: EthereumRequest) => Promise<unknown>
}

type WalletError = Error & {
  code?: number | string
  shortMessage?: string
  details?: string
  cause?: unknown
}

const arcTestnetAddEthereumChain = {
  chainId: `0x${arcTestnet.id.toString(16)}`,
  chainName: arcTestnet.name,
  nativeCurrency: arcTestnet.nativeCurrency,
  rpcUrls: arcTestnet.rpcUrls.default.http,
  blockExplorerUrls: [arcTestnet.blockExplorers.default.url],
}

function getEthereumProvider() {
  if (typeof window === 'undefined') return undefined
  return (window as Window & { ethereum?: EthereumProvider }).ethereum
}

function getWalletErrorMessage(error: unknown) {
  const walletError = error as Partial<WalletError>
  return [
    walletError.message,
    walletError.shortMessage,
    walletError.details,
    typeof walletError.cause === 'object' && walletError.cause ? (walletError.cause as Partial<WalletError>).message : undefined,
  ]
    .filter(Boolean)
    .join(' ')
}

function isUnknownChainError(error: unknown) {
  const walletError = error as Partial<WalletError>
  const message = getWalletErrorMessage(error).toLowerCase()

  return walletError.code === 4902
    || walletError.code === '4902'
    || message.includes('unknown chain')
    || message.includes('unrecognized chain')
    || message.includes('chain has not been added')
    || message.includes('has not been added')
    || message.includes('not configured')
    || message.includes('wallet_addethereumchain')
}

function isUserRejectedError(error: unknown) {
  const walletError = error as Partial<WalletError>
  const message = getWalletErrorMessage(error).toLowerCase()

  return walletError.code === 4001
    || walletError.code === '4001'
    || message.includes('rejected')
    || message.includes('denied')
    || message.includes('cancelled')
    || message.includes('canceled')
}

async function addArcTestnetManually() {
  const provider = getEthereumProvider()

  if (!provider?.request) {
    throw new Error('Wallet provider is not available')
  }

  await provider.request({
    method: 'wallet_addEthereumChain',
    params: [arcTestnetAddEthereumChain],
  })
}

/**
 * Hook providing a network guard for Coco DEX.
 *
 * Ensures all DEX operations (swap, approve, addLiquidity, removeLiquidity)
 * only execute when the wallet is connected to Arc Testnet (Chain ID 5042002).
 *
 * Usage in button state machines:
 *   if (isWrongNetwork) return { text: 'Switch to Arc Testnet', action: 'switch-network' }
 *
 * The switchToArc function will:
 * 1. Attempt wallet_switchEthereumChain
 * 2. If chain not found, attempt wallet_addEthereumChain with Arc Testnet params
 */
export function useNetworkGuard() {
  const { isConnected } = useAccount()
  const chainId = useChainId()
  const { switchChain, switchChainAsync, isPending: isWagmiSwitching, error: wagmiSwitchError } = useSwitchChain()
  const [switchState, setSwitchState] = useState<SwitchState>('idle')
  const [manualSwitchError, setManualSwitchError] = useState<Error | null>(null)

  const isCorrectNetwork = chainId === arcTestnet.id
  const isWrongNetwork = isConnected && !isCorrectNetwork
  const isSwitching = isWagmiSwitching || switchState === 'switching' || switchState === 'adding'
  const switchError = manualSwitchError ?? wagmiSwitchError ?? null

  const switchToArc = useCallback(async () => {
    if (!isWrongNetwork) return

    setSwitchState('switching')
    setManualSwitchError(null)

    try {
      await switchChainAsync({
        chainId: arcTestnet.id,
        addEthereumChainParameter: arcTestnetAddEthereumChain,
      })
      setSwitchState('success')
      return
    } catch (error) {
      if (isUserRejectedError(error)) {
        setManualSwitchError(error instanceof Error ? error : new Error('Network switch rejected'))
        setSwitchState('rejected')
        return
      }

      if (!isUnknownChainError(error)) {
        setManualSwitchError(error instanceof Error ? error : new Error('Network switch failed'))
        setSwitchState('error')
        return
      }
    }

    try {
      setSwitchState('adding')
      await addArcTestnetManually()
      setSwitchState('switching')
      await switchChainAsync({ chainId: arcTestnet.id })
      setSwitchState('success')
    } catch (error) {
      setManualSwitchError(error instanceof Error ? error : new Error('Network switch failed'))
      setSwitchState(isUserRejectedError(error) ? 'rejected' : 'error')
    }
  }, [isWrongNetwork, switchChainAsync])

  const resetState = useCallback(() => {
    setSwitchState('idle')
    setManualSwitchError(null)
  }, [])

  return {
    /** Whether the wallet is on the correct chain (Arc Testnet) */
    isCorrectNetwork,
    /** Whether the wallet is connected but on the WRONG chain */
    isWrongNetwork,
    /** Whether a chain switch is currently in progress */
    isSwitching,
    /** Current state of the switch operation */
    switchState,
    /** Error from the switch attempt */
    switchError,
    /** Lower-level Wagmi chain switch mutation for advanced callers */
    switchChain,
    /** Call to switch the wallet to Arc Testnet */
    switchToArc,
    /** Reset switchState back to idle */
    resetState,
    /** Arc Testnet chain ID for reference */
    requiredChainId: arcTestnet.id,
    /** Current wallet chain ID */
    currentChainId: chainId,
  }
}
