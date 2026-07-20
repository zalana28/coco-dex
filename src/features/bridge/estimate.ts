import type { EstimateResult } from '@circle-fin/bridge-kit'
import { formatUsdc, parseUsdc, subtractUsdc } from './amounts'

/**
 * Structured, display-ready view of a Bridge Kit estimate.
 *
 * All numeric fee amounts are represented either as a decimal USDC string or
 * `null` when the SDK did not return a value. `null` is a distinct state from
 * `"0"` — a Standard/SLOW transfer legitimately has no CCTP protocol (provider)
 * fee, while a Fast transfer requires one.
 */
export interface NormalizedEstimate {
  amount: string
  /** CCTP protocol / provider fee, or null when the SDK returned no value. */
  providerFee: string | null
  /** Forwarding Service (Circle Orbit relayer) fee, or null when unavailable. */
  forwarderFee: string | null
  /** Bridge Kit application fee, or null when absent. */
  kitFee: string | null
  /** Sum of all non-null fee components (string USDC). Never NaN. */
  totalFee: string
  /** Net amount minted on Arc after fees (string USDC). */
  destinationAmount: string
  /** Source-side gas estimates keyed by blockchain. */
  gas: EstimateResult['gasFees']
  /** Estimated duration label, if provided by the SDK. */
  duration: string | null
  /** Structured warnings surfaced to the UI (e.g. missing Fast fee). */
  warnings: string[]
}

/** A transfer mode that controls whether a provider (CCTP protocol) fee applies. */
export type BridgeTransferMode = 'SLOW' | 'FAST'

/**
 * Parse a single fee component by its `type` field. Returns `null` when the SDK
 * returned `amount: null` or `error` for that component. Never `Number(null)`.
 */
function feeByType(estimate: EstimateResult, type: EstimateResult['fees'][number]['type']): string | null {
  const match = estimate.fees.find((item) => item.type === type)
  if (!match) return null
  if (match.amount === null || match.amount === undefined) return null
  if (match.error) return null
  return match.amount
}

/**
 * Resolve a required fee component. Returns a bigint, or `null` if the SDK did
 * not provide a value. Throws only when `required` is true and the value is absent.
 */
function requiredFee(estimate: EstimateResult, type: EstimateResult['fees'][number]['type'], required: boolean, label: string): bigint | null {
  const raw = feeByType(estimate, type)
  if (raw === null) {
    if (required) throw new Error(`${label} estimate is unavailable`)
    return null
  }
  return parseUsdc(raw)
}

/**
 * Normalize a Bridge Kit {@link EstimateResult} into a structured, display-ready
 * view.
 *
 * Fee semantics by mode:
 * - SLOW / Standard: the CCTP protocol (provider) fee is expected to be absent.
 *   A null provider fee is treated as `0` and is NOT an error. The forwarder fee
 *   IS required when Forwarding Service is active.
 * - FAST: a provider fee is required. A null provider fee blocks the Fast route.
 *
 * @param estimate - The raw SDK estimate.
 * @param mode - The transfer mode used for the estimate (controls fee requirements).
 */
export function normalizeEstimate(estimate: EstimateResult, mode: BridgeTransferMode = 'SLOW'): NormalizedEstimate {
  const warnings: string[] = []

  const render = (value: bigint | null): string | null => (value === null ? null : formatUsdc(value))

  // Provider (CCTP protocol) fee: required for FAST, optional for SLOW.
  const providerRaw = feeByType(estimate, 'provider')
  const provider = requiredFee(estimate, 'provider', mode === 'FAST', 'CCTP protocol fee estimate is unavailable')
  // For SLOW/Standard, an absent provider fee is a legitimate zero (not an error).
  const providerFeeDisplay = providerRaw === null && mode === 'SLOW' ? '0' : render(provider)
  // Forwarder fee: required whenever Forwarding Service is active.
  const forwarder = requiredFee(estimate, 'forwarder', true, 'Forwarding Service fee estimate is unavailable')
  // Kit fee: optional.
  const kitRaw = feeByType(estimate, 'kit')
  const kit = kitRaw === null ? null : parseUsdc(kitRaw)

  if (providerRaw === null) {
    warnings.push(mode === 'FAST' ? 'CCTP protocol fee estimate is unavailable' : 'CCTP protocol fee: 0 USDC — Standard transfer')
  }

  const total = (provider ?? 0n) + (forwarder ?? 0n) + (kit ?? 0n)

  return {
    amount: estimate.amount,
    providerFee: providerFeeDisplay,
    forwarderFee: render(forwarder),
    kitFee: render(kit),
    totalFee: formatUsdc(total),
    destinationAmount: subtractUsdc(estimate.amount, formatUsdc(total)),
    gas: estimate.gasFees,
    duration: null,
    warnings,
  }
}
