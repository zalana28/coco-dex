import type { SourceChain } from './chains'

/** Explorer base URLs for supported source testnets (no credentialed query params). */
const SOURCE_EXPLORER_BASE: Record<SourceChain, string> = {
  Ethereum_Sepolia: 'https://sepolia.etherscan.io',
  Base_Sepolia: 'https://sepolia.basescan.org',
}

export const ARC_EXPLORER_BASE = 'https://testnet.arcscan.app'

/** Build a source-chain transaction explorer URL from a tx hash. */
export function sourceExplorerTxUrl(source: SourceChain, txHash: string): string {
  return `${SOURCE_EXPLORER_BASE[source]}/tx/${txHash}`
}

/** Build an Arc (destination) transaction explorer URL from a tx hash. */
export function arcExplorerTxUrl(txHash: string): string {
  return `${ARC_EXPLORER_BASE}/tx/${txHash}`
}

/** Build an address explorer URL on the destination Arc chain. */
export function arcExplorerAddressUrl(address: string): string {
  return `${ARC_EXPLORER_BASE}/address/${address}`
}
