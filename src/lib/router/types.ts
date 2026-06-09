import type { Token } from '@/types/token'

export type RouteQuoteSource = 'coco' | 'coco_stable' | 'xylonet' | 'unitflow' | 'synthra'

export type RouteAvailabilityStatus = 'loading' | 'available' | 'unavailable' | 'coming_soon'
export type RouteExecutionStatus = 'executable' | 'non_executable'
export type RouteHealthStatus = 'healthy' | 'degraded' | 'unavailable' | 'unknown'
export type RouteUnavailableReason =
  | 'Amount required'
  | 'Unsupported pair'
  | 'Contract read failed'
  | 'No quote returned'
export type RouteBlockedReason =
  | 'Quote-only beta'
  | 'Not routed'
  | 'Benchmark unavailable'
  | 'Quote stale'
  | 'Quote missing'
  | 'Input above beta cap'
  | 'Benchmark deviation too high'
  | 'Simulation missing'
  | 'Simulation failed'
  | 'Source unhealthy'

export type RouteQuote = {
  id: string
  source: RouteQuoteSource
  label: string
  inputToken: Token
  outputToken: Token
  amountIn: bigint
  amountOut: bigint
  amountOutFormatted: string
  minAmountOut: bigint
  routePath: string[]
  feeTier?: number
  feeBps?: number
  estimatedGas?: bigint
  quoteTimestamp: number
  ttlMs: number
  healthStatus: RouteHealthStatus
  warnings: string[]
  routerAddress?: `0x${string}`
  poolAddress?: `0x${string}`
  isExecutable: boolean
  executable: boolean
  availabilityStatus: RouteAvailabilityStatus
  executionStatus: RouteExecutionStatus
  unavailableReason?: RouteUnavailableReason
  blockedReason?: RouteBlockedReason
  warning?: string
}
