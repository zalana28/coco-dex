import type { RouteAvailabilityStatus, RouteHealthStatus } from './types'

export const DEFAULT_ROUTE_TTL_MS = 30_000

export function getRouteHealthStatus(availabilityStatus: RouteAvailabilityStatus): RouteHealthStatus {
  if (availabilityStatus === 'available') return 'healthy'
  if (availabilityStatus === 'loading') return 'unknown'
  return 'unavailable'
}
