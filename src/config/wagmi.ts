import { createConfig, http, fallback } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { baseSepolia, sepolia } from 'viem/chains'
import { arcTestnet } from './chains'

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

export const isWalletConnectConfigured = Boolean(walletConnectProjectId)

/** Public Arc Testnet endpoint. Always present as the last resort. */
const ARC_PUBLIC_RPC_URL = 'https://rpc.testnet.arc.network'

/**
 * Optional dedicated endpoint (Alchemy / QuickNode / dRPC). The public RPC is
 * aggressively rate-limited, so a project that sets this gets far fewer 429s.
 * Unset is a supported configuration — the app degrades to the public endpoint.
 */
const arcPrimaryRpcUrl = import.meta.env.VITE_ARC_RPC_PRIMARY?.trim()

export const hasDedicatedArcRpc = Boolean(arcPrimaryRpcUrl)

/**
 * Transport options.
 *
 * `retryCount` is deliberately 1. viem retries underneath react-query, and the
 * two layers multiply: react-query's attempts × the transport's. The previous
 * 3×4 combination meant a single failing query could fire 12 requests, and with
 * five concurrent quote reads that is up to 60 requests aimed at an endpoint
 * that just answered 429. Backoff now lives in the query layer, where it can
 * distinguish transient failures from permanent ones —
 * see `src/lib/router/quoteQueryOptions.ts`.
 *
 * multicall batching stays off: the Arc Testnet RPC does not support it
 * reliably, and Synthra/UnitFlow quote functions are `nonpayable`, so they must
 * not be batched via `eth_aggregate`.
 */
const arcTransportOptions = {
  retryCount: 1,
  retryDelay: 2_000,
  timeout: 30_000,
} as const

/**
 * `rank: false` keeps the declared order — the dedicated endpoint is preferred
 * and the public one is a genuine fallback, rather than latency-ranked traffic
 * that could drift back onto the rate-limited endpoint.
 */
const arcTransport = fallback(
  [
    ...(arcPrimaryRpcUrl ? [http(arcPrimaryRpcUrl, arcTransportOptions)] : []),
    http(ARC_PUBLIC_RPC_URL, arcTransportOptions),
  ],
  { rank: false, retryCount: 1 }
)

const connectors = [
  injected(),
  ...(walletConnectProjectId
    ? [
        walletConnect({
          projectId: walletConnectProjectId,
          metadata: {
            name: 'Coco DEX',
            description: 'Testnet-native stablecoin routing on Arc Testnet',
            url: typeof window !== 'undefined' ? window.location.origin : 'https://coco-dex.vercel.app',
            icons: ['https://coco-dex.vercel.app/coconut.svg'],
          },
          showQrModal: true,
        }),
      ]
    : []),
]

export const wagmiConfig = createConfig({
  chains: [arcTestnet, sepolia, baseSepolia],
  connectors,
  transports: {
    [arcTestnet.id]: arcTransport,
    [sepolia.id]: http(),
    [baseSepolia.id]: http(),
  },
})
