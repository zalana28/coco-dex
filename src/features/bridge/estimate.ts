import type { EstimateResult } from '@circle-fin/bridge-kit'
import { formatUsdc, parseUsdc, subtractUsdc } from './amounts'

export interface NormalizedEstimate {
  amount: string
  providerFee: string | null
  forwarderFee: string | null
  kitFee: string | null
  totalFee: string
  destinationAmount: string
  gas: EstimateResult['gasFees']
  duration: string | null
}

export function normalizeEstimate(estimate: EstimateResult): NormalizedEstimate {
  const fee = (type: EstimateResult['fees'][number]['type']) => estimate.fees.filter((item) => item.type === type && item.amount !== null).reduce<bigint | null>((sum, item) => (sum ?? 0n) + parseUsdc(item.amount as string), null)
  const provider = fee('provider')
  const forwarder = fee('forwarder')
  const kit = fee('kit')
  if (provider === null) throw new Error('CCTP protocol fee estimate is unavailable')
  if (forwarder === null) throw new Error('Forwarding Service fee estimate is unavailable')
  if (estimate.gasFees.length === 0 || estimate.gasFees.some((item) => item.fees === null || item.error)) throw new Error('Source gas estimate is unavailable')
  const total = provider + forwarder + (kit ?? 0n)
  const render = (value: bigint | null) => value === null ? null : formatUsdc(value)
  return { amount: estimate.amount, providerFee: render(provider), forwarderFee: render(forwarder), kitFee: render(kit), totalFee: formatUsdc(total), destinationAmount: subtractUsdc(estimate.amount, formatUsdc(total)), gas: estimate.gasFees, duration: null }
}
