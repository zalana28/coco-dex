import { defineChain } from 'viem'

/**
 * Arc Testnet Chain Configuration
 *
 * IMPORTANT — USDC Decimal Distinction:
 *
 * Arc uses USDC as its native gas token. The native gas layer operates at
 * 18 decimals (standard EVM wei precision), so nativeCurrency.decimals = 18.
 *
 * However, for DeFi application logic (swaps, pools, balances, approvals),
 * USDC is accessed through its ERC-20 interface at:
 *   0x3600000000000000000000000000000000000000
 * which uses 6 decimals (standard USDC precision).
 *
 * NEVER mix native 18-decimal gas accounting with ERC-20 6-decimal token amounts.
 * - Use wagmi's useBalance() ONLY for gas estimation/display.
 * - Use useTokenBalance() with the ERC-20 address for all DEX operations.
 */
export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18, // Native gas uses 18 decimals (EVM standard wei)
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.network'],
    },
  },
  blockExplorers: {
    default: {
      name: 'ArcScan',
      url: 'https://testnet.arcscan.app',
    },
  },
  testnet: true,
})
