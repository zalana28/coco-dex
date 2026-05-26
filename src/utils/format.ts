/**
 * Format a number as currency (e.g., $1,234,567.89)
 */
export function formatCurrency(value: number, decimals = 2): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value)
}

/**
 * Format a large number with suffixes (e.g., 1.2M, 890K)
 */
export function formatCompact(value: number): string {
  if (value >= 1_000_000) {
    return `$${(value / 1_000_000).toFixed(1)}M`
  }
  if (value >= 1_000) {
    return `$${(value / 1_000).toFixed(0)}K`
  }
  return `$${value.toFixed(2)}`
}

/**
 * Format a token amount with proper decimal handling (6 decimals)
 */
export function formatTokenAmount(amount: bigint | number, decimals: number = 6): string {
  if (typeof amount === 'bigint') {
    const divisor = BigInt(10 ** decimals)
    const whole = amount / divisor
    const fraction = amount % divisor
    const fractionStr = fraction.toString().padStart(decimals, '0').replace(/0+$/, '')
    if (fractionStr === '') return whole.toString()
    return `${whole}.${fractionStr}`
  }
  return amount.toFixed(Math.min(decimals, 6)).replace(/\.?0+$/, '')
}

/**
 * Parse a decimal string into a bigint with given decimals
 */
export function parseTokenAmount(value: string, decimals: number = 6): bigint {
  if (!value || value === '.' || value === '') return BigInt(0)
  const [whole, fraction = ''] = value.split('.')
  const paddedFraction = fraction.slice(0, decimals).padEnd(decimals, '0')
  return BigInt(whole + paddedFraction)
}

/**
 * Truncate an Ethereum address
 */
export function truncateAddress(address: string, start = 6, end = 4): string {
  if (address.length <= start + end) return address
  return `${address.slice(0, start)}...${address.slice(-end)}`
}

/**
 * Format a percentage
 */
export function formatPercentage(value: number, decimals = 2): string {
  return `${value.toFixed(decimals)}%`
}
