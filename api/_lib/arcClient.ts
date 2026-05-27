import { createPublicClient, http, defineChain } from 'viem'

/**
 * Arc Testnet chain definition for server-side viem usage.
 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: {
    default: { http: [process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network'] },
  },
  blockExplorers: {
    default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
  },
  testnet: true,
})

/**
 * Public client for reading Arc Testnet data (server-side).
 */
export function getArcClient() {
  return createPublicClient({
    chain: arcTestnet,
    transport: http(process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network'),
  })
}

/** Contract addresses */
export const PAIR_ADDRESS = '0x0eEA9DC9153215B15b1E6c43f4D68779002d4F1c' as const
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as const
export const EURC_ADDRESS = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a' as const

/** USDC is token0 because its address is numerically lower */
export const USDC_IS_TOKEN0 = USDC_ADDRESS.toLowerCase() < EURC_ADDRESS.toLowerCase()
