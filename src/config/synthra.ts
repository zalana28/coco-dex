import { EURC, USDC } from '@/config/tokens'

export const SYNTHRA_CHAIN_ID = 5_042_002

export const SYNTHRA_V3_FACTORY_ADDRESS: `0x${string}` = '0x0fB6EEDA6e90E90797083861A75D15752a27f59c'
export const SYNTHRA_V3_MULTICALL_ADDRESS: `0x${string}` = '0xe139b61c9B8Eebf32bb335cb11AA6B7Cd69e13f4'
export const SYNTHRA_V3_QUOTER_ADDRESS: `0x${string}` = '0x3Ce954107b1A675826B33bF23060Dd655e3758fE'
export const SYNTHRA_V3_POSITION_MANAGER_ADDRESS: `0x${string}` = '0x444Cc395346428216fB6f2892eb03cB804aE4CD5'
export const SYNTHRA_V3_TICK_LENS_ADDRESS: `0x${string}` = '0x84040D61a3f4fd9E116FBb5fB633DaC9172AC5F8'
export const SYNTHRA_V3_SWAP_ROUTER_ADDRESS: `0x${string}` = '0xA545bCB1Bd7985c59ea162aB1748A0803434C31b'
export const SYNTHRA_UNIVERSAL_ROUTER_ADDRESS: `0x${string}` = '0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F'
export const SYNTHRA_WRAPPED_NATIVE_ADDRESS: `0x${string}` = '0x911b4000D3422F482F4062a913885f7b035382Df'

export const SYNTHRA_SUPPORTED_TOKENS = {
  USDC: USDC.address,
  EURC: EURC.address,
} as const

export const SYNTHRA_SUPPORTED_PAIR = [USDC.address, EURC.address] as const
export const SYNTHRA_QUOTE_FEE_TIERS = [500, 3_000, 10_000] as const

export const SYNTHRA_DEX = {
  id: 'synthra',
  label: 'Synthra',
  chainId: SYNTHRA_CHAIN_ID,
  v3: {
    factoryAddress: SYNTHRA_V3_FACTORY_ADDRESS,
    multicallAddress: SYNTHRA_V3_MULTICALL_ADDRESS,
    quoterAddress: SYNTHRA_V3_QUOTER_ADDRESS,
    nonfungiblePositionManagerAddress: SYNTHRA_V3_POSITION_MANAGER_ADDRESS,
    tickLensAddress: SYNTHRA_V3_TICK_LENS_ADDRESS,
    swapRouterAddress: SYNTHRA_V3_SWAP_ROUTER_ADDRESS,
  },
  universalRouterAddress: SYNTHRA_UNIVERSAL_ROUTER_ADDRESS,
  wrappedNativeAddress: SYNTHRA_WRAPPED_NATIVE_ADDRESS,
  supportedTokens: SYNTHRA_SUPPORTED_TOKENS,
  supportedPair: SYNTHRA_SUPPORTED_PAIR,
  quoteFeeTiers: SYNTHRA_QUOTE_FEE_TIERS,
} as const
