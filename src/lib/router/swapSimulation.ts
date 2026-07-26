/**
 * Shared pieces of the simulate-then-submit path used by the router swap hooks.
 */

/**
 * How many blocks the chain may advance between simulation and submission
 * before the swap is rejected.
 *
 * Zero tolerance would reject almost every swap — a block can easily land while
 * the request is in flight, without invalidating anything. A couple of blocks
 * catches the case that matters: reserves or allowances moving underneath a
 * simulation that has already passed.
 */
export const SIMULATION_BLOCK_DRIFT_TOLERANCE = 2

/** User-facing reason when the chain moved past that tolerance. */
export const SIMULATION_STATE_MOVED_REASON = 'State moved — refresh quote and retry'

/**
 * Run a simulation, returning the outcome instead of throwing.
 *
 * The generic exists to preserve viem's inference. `simulateContract` returns a
 * `request` whose type is derived from the specific ABI and function name — and
 * that precision is what makes it assignable to `writeContract`. Storing it in
 * a pre-annotated `let` (the obvious way to get it out of a `try` block) widens
 * it to a union and breaks the assignment, notably for `payable` functions
 * where `value` is present.
 *
 * Handing the request straight to `writeContract` is the whole point: it
 * carries the validated arguments *and* the gas limit viem derived. Rebuilding
 * the arguments by hand makes the wallet re-run `eth_estimateGas` against the
 * user's own RPC — a different node, a different view of state, and none of the
 * app's retry configuration.
 */
export async function trySimulate<T>(
  run: () => Promise<T>
): Promise<{ ok: true; value: T } | { ok: false; error: unknown }> {
  try {
    return { ok: true, value: await run() }
  } catch (error) {
    return { ok: false, error }
  }
}

/**
 * Read the current block, or undefined if the read fails.
 *
 * A failed block read is not itself a reason to block a swap, so callers simply
 * skip the drift check when this returns undefined.
 */
export async function tryGetBlockNumber(
  read: () => Promise<bigint>
): Promise<bigint | undefined> {
  try {
    return await read()
  } catch {
    return undefined
  }
}

/**
 * Whether the chain moved further than the tolerance since the simulation.
 */
export function hasStateMoved(simBlockNumber: bigint | undefined, nowBlock: bigint | undefined): boolean {
  if (simBlockNumber === undefined || nowBlock === undefined) return false
  return nowBlock > simBlockNumber + BigInt(SIMULATION_BLOCK_DRIFT_TOLERANCE)
}
