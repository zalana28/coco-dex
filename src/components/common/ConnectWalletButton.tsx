import { useAccount, useConnect, useDisconnect, useChainId, useSwitchChain, type Connector } from 'wagmi'
import { truncateAddress } from '@/utils/format'
import { arcTestnet } from '@/config/chains'
import { isWalletConnectConfigured } from '@/config/wagmi'
import { Wallet, LogOut, AlertTriangle, X, Smartphone, WalletCards } from 'lucide-react'
import { useState, useCallback } from 'react'
import { useClickOutside } from '@/hooks/useClickOutside'

export function ConnectWalletButton() {
  const { address, isConnected, isConnecting } = useAccount()
  const { connect, connectors, error: connectError, isPending } = useConnect()
  const { disconnect } = useDisconnect()
  const chainId = useChainId()
  const { switchChain } = useSwitchChain()
  const [showDropdown, setShowDropdown] = useState(false)
  const [showConnectOptions, setShowConnectOptions] = useState(false)

  const closeDropdown = useCallback(() => setShowDropdown(false), [])
  const closeConnectOptions = useCallback(() => setShowConnectOptions(false), [])
  const dropdownRef = useClickOutside<HTMLDivElement>(closeDropdown)
  const connectOptionsRef = useClickOutside<HTMLDivElement>(closeConnectOptions)

  const isWrongNetwork = isConnected && chainId !== arcTestnet.id

  if (isConnecting) {
    return (
      <button className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-coco-dark-border bg-coco-dark-surface/80 px-4 py-2 text-sm text-coco-dark-muted shadow-coco-1 backdrop-blur-xl">
        <div className="h-4 w-4 border-2 border-coco-green-500 border-t-transparent rounded-full animate-spin" />
        Connecting...
      </button>
    )
  }

  if (isWrongNetwork) {
    return (
      <button
        onClick={() => switchChain({ chainId: arcTestnet.id })}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-coco-amber-500/30 bg-coco-amber-500/10 px-4 py-2 text-sm font-medium text-coco-amber-500 shadow-coco-1 transition-all hover:bg-coco-amber-500/20"
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
          className="flex min-h-11 items-center justify-center gap-2 rounded-xl border border-coco-dark-border bg-coco-dark-surface/80 px-4 py-2 text-sm text-coco-dark-text shadow-coco-1 backdrop-blur-xl transition-all hover:border-coco-green-500/50 hover:bg-coco-dark-bg/80"
        >
          <div className="h-2 w-2 rounded-full bg-coco-green-500" />
          <span className="font-mono">{truncateAddress(address)}</span>
        </button>

        {showDropdown && (
          <div className="absolute right-0 top-full mt-2 w-48 rounded-xl border border-coco-dark-border bg-coco-dark-surface/95 py-1 shadow-coco-2 backdrop-blur-xl">
            <div className="px-4 py-2 border-b border-coco-dark-border">
              <p className="text-[10px] text-coco-dark-muted uppercase tracking-wider">Network</p>
              <p className="text-xs font-medium mt-0.5 text-coco-green-500">Arc Testnet</p>
            </div>
            <button
              onClick={() => { disconnect(); setShowDropdown(false) }}
              className="w-full flex min-h-11 items-center gap-2 px-4 py-2.5 text-sm text-coco-dark-muted hover:text-coco-red-500 hover:bg-coco-dark-bg transition-colors"
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
    <div className="relative" ref={connectOptionsRef}>
      <button
        onClick={() => setShowConnectOptions((value) => !value)}
        className="flex min-h-11 items-center justify-center gap-2 rounded-xl bg-coco-green-500 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-coco-green-500/25 transition-all hover:-translate-y-0.5 hover:bg-coco-green-600 hover:shadow-coco-green-500/35 active:scale-[0.98]"
      >
        <Wallet className="h-4 w-4" />
        Connect Wallet
      </button>

      {showConnectOptions && (
        <div className="fixed inset-x-3 top-20 z-[60] rounded-2xl border border-coco-dark-border bg-coco-dark-surface/95 p-4 shadow-coco-3 backdrop-blur-2xl sm:absolute sm:inset-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-coco-dark-text">Connect wallet</h2>
              <p className="mt-1 text-xs leading-5 text-coco-dark-muted">
                Open this page in your wallet browser or connect with WalletConnect.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowConnectOptions(false)}
              className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-coco-dark-muted transition-colors hover:bg-coco-dark-bg hover:text-coco-dark-text"
              aria-label="Close wallet options"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-2">
            {connectors.map((connector) => (
              <ConnectorButton
                key={`${connector.id}-${connector.name}`}
                connector={connector}
                isPending={isPending}
                onConnect={() => connect({ connector })}
              />
            ))}

            {!isWalletConnectConfigured && (
              <button
                type="button"
                disabled
                className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-coco-dark-border bg-coco-dark-bg/70 px-3 py-2.5 text-left text-sm text-coco-dark-muted opacity-70"
              >
                <span className="flex items-center gap-2">
                  <WalletCards className="h-4 w-4" />
                  WalletConnect
                </span>
                <span className="text-[11px]">Project ID missing</span>
              </button>
            )}
          </div>

          {connectError && (
            <p className="mt-3 rounded-xl border border-coco-red-500/20 bg-coco-red-500/10 px-3 py-2 text-xs leading-5 text-coco-red-500">
              {connectError.message}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ConnectorButton({ connector, isPending, onConnect }: { connector: Connector; isPending: boolean; onConnect: () => void }) {
  const availability = connector as Connector & { ready?: boolean }
  const isUnavailable = availability.ready === false
  const isWalletConnect = connector.id.toLowerCase().includes('walletconnect')

  return (
    <button
      type="button"
      disabled={isPending || isUnavailable}
      onClick={onConnect}
      className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-coco-dark-border bg-coco-dark-bg/70 px-3 py-2.5 text-left text-sm text-coco-dark-text transition-all hover:border-coco-green-500/40 hover:bg-coco-dark-bg disabled:cursor-not-allowed disabled:opacity-60"
    >
      <span className="flex items-center gap-2">
        {isWalletConnect ? <WalletCards className="h-4 w-4 text-coco-teal-400" /> : <Smartphone className="h-4 w-4 text-coco-teal-400" />}
        {connector.name}
      </span>
      <span className="text-[11px] text-coco-dark-muted">
        {isUnavailable ? 'Unavailable' : isPending ? 'Connecting...' : 'Connect'}
      </span>
    </button>
  )
}
