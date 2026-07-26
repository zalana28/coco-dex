/**
 * Remembers which Synthra fee tier last produced the best quote for a pair.
 *
 * Synthra quotes are `nonpayable`, so the three tiers cannot be batched into one
 * multicall — each costs its own RPC round trip. Polling all three every cycle
 * was roughly a third of total quote load for a route that rarely wins, so only
 * the remembered tier is polled continuously and the others are fetched when
 * the user opens the all-routes panel.
 *
 * A module-level cache rather than component state: this is memoisation, not
 * rendering state. Nothing should re-render because it changed, and keeping it
 * outside the tree means the choice survives remounts and pair switches.
 */
export type SynthraFee = 500 | 3_000 | 10_000

export const SYNTHRA_FEE_TIERS: readonly SynthraFee[] = [500, 3_000, 10_000]
export const DEFAULT_SYNTHRA_FEE: SynthraFee = 500

const winningFeeByPair = new Map<string, SynthraFee>()

export function getPairKey(tokenInAddress: string, tokenOutAddress: string): string {
  return `${tokenInAddress}-${tokenOutAddress}`.toLowerCase()
}

export function getWinningSynthraFee(pairKey: string): SynthraFee {
  return winningFeeByPair.get(pairKey) ?? DEFAULT_SYNTHRA_FEE
}

export function recordWinningSynthraFee(pairKey: string, fee: SynthraFee): void {
  winningFeeByPair.set(pairKey, fee)
}

/**
 * Pick the best tier from whatever was actually read. Returns undefined when no
 * tier produced a usable amount, so a single polled tier does not "win" by
 * default and overwrite a genuine earlier result.
 */
export function selectWinningSynthraFee(
  amountByFee: Record<SynthraFee, bigint | undefined>
): SynthraFee | undefined {
  let best: { fee: SynthraFee; amountOut: bigint } | undefined
  for (const fee of SYNTHRA_FEE_TIERS) {
    const amountOut = amountByFee[fee]
    if (amountOut === undefined || amountOut <= BigInt(0)) continue
    if (!best || amountOut > best.amountOut) best = { fee, amountOut }
  }
  return best?.fee
}

/** Test seam — resets module state between cases. */
export function resetSynthraFeeCache(): void {
  winningFeeByPair.clear()
}
