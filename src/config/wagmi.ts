import { createConfig, http } from 'wagmi'
import { injected, walletConnect } from 'wagmi/connectors'
import { baseSepolia, sepolia } from 'viem/chains'
import { arcTestnet } from './chains'

const walletConnectProjectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID

export const isWalletConnectConfigured = Boolean(walletConnectProjectId)

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
    [arcTestnet.id]: http('https://rpc.testnet.arc.network', {
      retryCount: 3,
      retryDelay: 1500,
      timeout: 30000,
    }),
    [sepolia.id]: http(),
    [baseSepolia.id]: http(),
  },
})
