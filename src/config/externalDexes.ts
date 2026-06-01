import { USDC, EURC } from '@/config/tokens'
import { UNITFLOW_DEX } from '@/config/unitflow'

export const XYLONET_ROUTER_ADDRESS: `0x${string}` = '0x73742278c31a76dBb0D2587d03ef92E6E2141023'
export const XYLONET_USDC_EURC_POOL_ADDRESS: `0x${string}` = '0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1'

export const XYLONET_SUPPORTED_TOKENS = {
  USDC: USDC.address,
  EURC: EURC.address,
} as const

export const EXTERNAL_DEXES = {
  xylonet: {
    id: 'xylonet',
    label: 'XyloNet',
    routerAddress: XYLONET_ROUTER_ADDRESS,
    usdcEurcPoolAddress: XYLONET_USDC_EURC_POOL_ADDRESS,
    supportedTokens: XYLONET_SUPPORTED_TOKENS,
  },
  unitflow: UNITFLOW_DEX,
} as const
