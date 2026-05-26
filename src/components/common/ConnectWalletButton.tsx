import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain } from 'wagmi'
import { truncateAddress } from '@/utils/format'
import { arcTestnet } from '@/config/chains'
import { Wallet, LogOut, AlertTriangle } from 'lucide-react'
import { useState, useCallback } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'

export function ConnectWalletButton() {
  const { address, isConnected, isConnecting } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const [showDropdown, setShowDropdown] = useState(false)

  const closeDropdown = useCallback(() => setShowDropdown(false), [])
  const dropdownRef = useClickOutside<HTMLDivElement>(closeDropdown)

  const isWrongNetwork = isConnected && chainId !== arcTestnet.id

  if (isConnecting) {
    return (
      <button className="flex items-center gap-2 px-4 py-2 rounded-xl bg-coco-dark-surface border border-coco-dark-border text-sm text-coco-dark-muted">
        <div className="h-4 w-4 border-2 border-coco-green-500 border-t-transparent rounded-full animate-spin" />
        Connecting...
      </button>
    )
  }

  if (isWrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-coco-amber-500/10 border border-coco-amber-500/30 text-sm text-coco-amber-500 hover:bg-coco-amber-500/20 transition-colors"
      >
        <AlertTriangle className="h-4 w-4" />
        Switch Network
      </button>
    )
  }

  if (isConnected && address) {
    return (
      <div className="relative" ref={dropdownRef}>
        <button
          onClick={() => setShowDropdown(!showDropdown)}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-coco-dark-surface border border-coco-dark-border text-sm text-coco-dark-text hover:border-coco-green-500/50 transition-colors"
        >
          <div className="h-2 w-2 rounded-full bg-coco-green-500" />
          <span className="font-mono">{truncateAddress(address)}</span>
        </button>

        {showDropdown && (
          <div className="absolute right-0 top-full mt-2 w-48 rounded-xl bg-coco-dark-surface border border-coco-dark-border shadow-coco-2 py-1">
            <button
              onClick={() => { disconnect(); setShowDropdown(false) }}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-coco-dark-muted hover:text-coco-red-500 hover:bg-coco-dark-bg transition-colors"
            >
              <LogOut className="h-4 w-4" />
              Disconnect
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <button
      onClick={() => connect({ connector: connectors[0]! })}
      className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-coco-green-500 text-white text-sm font-medium hover:bg-coco-green-600 active:scale-[0.98] transition-all"
    >
      <Wallet className="h-4 w-4" />
      Connect Wallet
    </button>
  )
}
