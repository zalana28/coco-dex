export const ROUTER_SHADOW_MODE_CONFIG = {
  nativeStable: {
    quoteOnly: true,
    execute: false,
    quoteTtlMs: 30_000,
    benchmarkMaxDeviationBps: 250,
    maxInputCap: {
      enabled: true,
      amount: 1_000_000n,
      label: '1 USDC/EURC',
    },
  },
} as const

export type RouterShadowModeConfig = typeof ROUTER_SHADOW_MODE_CONFIG
