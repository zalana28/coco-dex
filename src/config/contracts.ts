/**
 * Deployed Coco DEX Contract Addresses — Arc Testnet
 *
 * Deployed and verified on Arc Testnet (Chain ID: 5042002).
 * Explorer: https://testnet.arcscan.app
 *
 * IMPORTANT: These are ERC-20-only contracts (no ETH/WETH/payable logic).
 * All token amounts use 6 decimals (USDC and EURC on Arc).
 * Native gas USDC (18 decimals) is NEVER used in DEX operations.
 */

/** CocoFactory — creates and tracks trading pairs */
export const FACTORY_ADDRESS: `0x${string}` = '0xE1E39F01207cD3f56d3b2a69B757cf2b59c8e5bE'

/** CocoRouter — swap and liquidity entry point */
export const ROUTER_ADDRESS: `0x${string}` = '0xC31166847A4CEC31629a0ABe4E6383B3CD75732A'

/** USDC/EURC Pair — the LP pool contract */
export const USDC_EURC_PAIR_ADDRESS: `0x${string}` = '0x0eEA9DC9153215B15b1E6c43f4D68779002d4F1c'
