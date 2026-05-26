import { useAccount, useChainId, useSwitchChain } from 'wagmi'
import { useState, useCallback } from 'react'
import { arcTestnet } from '@/config/chains'

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
  const { switchChain, isPending: isSwitching, error: switchError } = useSwitchChain()
  const [switchState, setSwitchState] = useState<'idle' | 'switching' | 'success' | 'rejected' | 'error'>('idle')

  const isCorrectNetwork = chainId === arcTestnet.id
  const isWrongNetwork = isConnected && !isCorrectNetwork

  const switchToArc = useCallback(() => {
    if (!isWrongNetwork) return

    setSwitchState('switching')
    switchChain(
      { chainId: arcTestnet.id },
      {
        onSuccess: () => setSwitchState('success'),
        onError: (err) => {
          if (err.message?.includes('rejected') || err.message?.includes('denied')) {
            setSwitchState('rejected')
          } else {
            setSwitchState('error')
          }
        },
      }
    )
  }, [isWrongNetwork, switchChain])

  const resetState = useCallback(() => setSwitchState('idle'), [])

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
