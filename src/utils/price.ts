/**
 * Constant product AMM formula: getAmountOut
 * Given an input amount, calculate the output amount
 * Uses the formula: amountOut = (reserveOut * amountIn * 997) / (reserveIn * 1000 + amountIn * 997)
 */
export function getAmountOut(
  amountIn: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): bigint {
  if (amountIn <= BigInt(0)) return BigInt(0)
  if (reserveIn <= BigInt(0) || reserveOut <= BigInt(0)) return BigInt(0)

  const amountInWithFee = amountIn * BigInt(997)
  const numerator = amountInWithFee * reserveOut
  const denominator = reserveIn * BigInt(1000) + amountInWithFee
  return numerator / denominator
}

/**
 * Constant product AMM formula: getAmountIn
 * Given a desired output amount, calculate the required input
 */
export function getAmountIn(
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): bigint {
  if (amountOut <= BigInt(0)) return BigInt(0)
  if (reserveIn <= BigInt(0) || reserveOut <= BigInt(0)) return BigInt(0)
  if (amountOut >= reserveOut) return BigInt(0) // Cannot withdraw more than reserve

  const numerator = reserveIn * amountOut * BigInt(1000)
  const denominator = (reserveOut - amountOut) * BigInt(997)
  return numerator / denominator + BigInt(1)
}

/**
 * Calculate price impact as a percentage
 */
export function calculatePriceImpact(
  amountIn: bigint,
  amountOut: bigint,
  reserveIn: bigint,
  reserveOut: bigint
): number {
  if (amountIn <= BigInt(0) || reserveIn <= BigInt(0) || reserveOut <= BigInt(0)) return 0

  // Ideal rate (no slippage): reserveOut / reserveIn
  // Actual rate: amountOut / amountIn
  const idealOut = (amountIn * reserveOut) / reserveIn
  if (idealOut <= BigInt(0)) return 0

  const impact = Number(idealOut - amountOut) / Number(idealOut)
  return impact * 100
}

/**
 * Calculate minimum received based on slippage tolerance
 */
export function calculateMinimumReceived(
  amountOut: bigint,
  slippageBps: number // basis points (e.g., 50 = 0.5%)
): bigint {
  const slippageFactor = BigInt(10000 - slippageBps)
  return (amountOut * slippageFactor) / BigInt(10000)
}
