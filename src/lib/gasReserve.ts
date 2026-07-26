import { USDC } from '@/config/tokens'
import type { Token } from '@/types/token'

/**
 * Gas reserve rules for Arc Testnet.
 *
 * Arc pays gas in USDC. The ERC-20 at `0x3600…0000` (6 decimals) is the native
 * predeploy, so it is backed by the same balance that pays for the transaction
 * — spending all of it leaves nothing for gas.
 *
 * This is invisible in simulation. `eth_call` does not deduct the upfront gas
 * cost, but `eth_estimateGas` and real execution deduct `gasLimit × gasPrice`
 * *before* the call runs. A near-max USDC swap therefore simulates cleanly and
 * then reverts in `transferFrom`.
 *
 * Note the decimal split, which the config comments warn about: native USDC is
 * 18 decimals, ERC-20 USDC is 6. The two balances are not directly comparable,
 * so each threshold below is expressed in its own unit.
 */

/** Held back from a max ERC-20 USDC swap, in 6-decimal units. 0.1 USDC. */
export const GAS_BUFFER_USDC = BigInt(100_000)

/**
 * Native balance below which a swap is refused, in 18-decimal wei. 0.05 USDC.
 *
 * A floor, not an estimate: the real cost is only known once a gas limit and
 * gas price exist, which is after the point where the button state is decided.
 * It is set low enough not to block legitimate swaps and high enough to catch
 * a wallet that genuinely cannot pay.
 */
export const MIN_NATIVE_GAS_WEI = BigInt(50_000_000_000_000_000)

/**
 * Whether this token shares its balance with the native gas token.
 */
export function isNativeBackedToken(token: Token): boolean {
  return token.address.toLowerCase() === USDC.address.toLowerCase()
}

/**
 * The most of `token` a user can actually swap, holding back gas where the
 * token being spent is also the token paying for the transaction.
 *
 * Returns 0 rather than a negative amount when the balance is below the buffer.
 */
export function getMaxSpendable(balance: bigint, token: Token): bigint {
  if (!isNativeBackedToken(token)) return balance
  return balance > GAS_BUFFER_USDC ? balance - GAS_BUFFER_USDC : BigInt(0)
}

/**
 * Whether the wallet's native balance is too low to pay for a transaction.
 *
 * Undefined balance means "not loaded yet" and is not treated as insufficient —
 * blocking the button on a pending read would be worse than letting the
 * simulation catch it.
 */
export function hasInsufficientGas(nativeBalance: bigint | undefined): boolean {
  if (nativeBalance === undefined) return false
  return nativeBalance < MIN_NATIVE_GAS_WEI
}
