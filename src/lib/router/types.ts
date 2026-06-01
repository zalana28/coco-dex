export type RouteQuoteSource = 'coco' | 'xylonet' | 'unitflow' | 'synthra'

export type RouteAvailabilityStatus = 'loading' | 'available' | 'unavailable' | 'coming_soon'
export type RouteExecutionStatus = 'executable' | 'non_executable'
export type RouteUnavailableReason =
  | 'Amount required'
  | 'Unsupported pair'
  | 'Contract read failed'
  | 'No quote returned'

export type RouteQuote = {
  id: string
  source: RouteQuoteSource
  label: string
  amountIn: bigint
  amountOut: bigint
  amountOutFormatted: string
  minAmountOut: bigint
  routePath: string[]
  feeTier?: number
  routerAddress?: `0x${string}`
  poolAddress?: `0x${string}`
  isExecutable: boolean
  availabilityStatus: RouteAvailabilityStatus
  executionStatus: RouteExecutionStatus
  unavailableReason?: RouteUnavailableReason
  warning?: string
}
