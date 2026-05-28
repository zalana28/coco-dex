export type RouteQuoteSource = 'coco' | 'xylonet' | 'unitflow' | 'synthra'

export type RouteQuoteStatus = 'loading' | 'available' | 'unavailable' | 'coming_soon'
export type RouteExecutionStatus = 'executable' | 'non_executable'

export type RouteQuote = {
  id: string
  source: RouteQuoteSource
  label: string
  amountIn: bigint
  amountOut: bigint
  amountOutFormatted: string
  minAmountOut: bigint
  routePath: string[]
  routerAddress?: `0x${string}`
  poolAddress?: `0x${string}`
  isExecutable: boolean
  status: RouteQuoteStatus
  executionStatus: RouteExecutionStatus
  warning?: string
  errorMessage?: string
}
