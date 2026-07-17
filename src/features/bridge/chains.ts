import { ArcTestnet, BaseSepolia, EthereumSepolia } from '@circle-fin/bridge-kit'

export type EvmChainId = number & { readonly __brand: 'EvmChainId' }
export type CctpDomain = number & { readonly __brand: 'CctpDomain' }
export type SourceChain = 'Ethereum_Sepolia' | 'Base_Sepolia'
export type DestinationChain = 'Arc_Testnet'

export function asEvmChainId(value: number): EvmChainId {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error('Invalid EVM chain ID')
  return value as EvmChainId
}

export function asCctpDomain(value: number): CctpDomain {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error('Invalid CCTP domain')
  return value as CctpDomain
}

export interface BridgeRoute {
  readonly chain: SourceChain | DestinationChain
  readonly chainId: EvmChainId
  readonly domain: CctpDomain
}

export const SOURCE_ROUTES = [
  { chain: 'Ethereum_Sepolia', chainId: asEvmChainId(EthereumSepolia.chainId), domain: asCctpDomain(EthereumSepolia.cctp.domain) },
  { chain: 'Base_Sepolia', chainId: asEvmChainId(BaseSepolia.chainId), domain: asCctpDomain(BaseSepolia.cctp.domain) },
] as const satisfies readonly BridgeRoute[]

export const ARC_ROUTE = {
  chain: 'Arc_Testnet',
  chainId: asEvmChainId(ArcTestnet.chainId),
  domain: asCctpDomain(ArcTestnet.cctp.domain),
} as const satisfies BridgeRoute

export function isSourceChain(value: string): value is SourceChain {
  return value === 'Ethereum_Sepolia' || value === 'Base_Sepolia'
}
