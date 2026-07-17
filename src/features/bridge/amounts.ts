export const USDC_DECIMALS = 6 as const
const SCALE = 10n ** BigInt(USDC_DECIMALS)
const HUMAN_USDC = /^(?:0|[1-9]\d*)(?:\.(\d{1,6}))?$/

export function parseUsdc(value: string): bigint {
  const match = HUMAN_USDC.exec(value)
  if (!match) throw new Error('USDC amount must be a non-negative decimal with at most 6 places')
  const [whole = '0', fraction = ''] = value.split('.')
  return BigInt(whole) * SCALE + BigInt(fraction.padEnd(USDC_DECIMALS, '0') || '0')
}

export function formatUsdc(value: bigint): string {
  if (value < 0n) throw new Error('USDC amount cannot be negative')
  const whole = value / SCALE
  const fraction = (value % SCALE).toString().padStart(USDC_DECIMALS, '0').replace(/0+$/, '')
  return fraction ? `${whole}.${fraction}` : whole.toString()
}

export function normalizeUsdc(value: string): string {
  return formatUsdc(parseUsdc(value))
}

export function subtractUsdc(amount: string, fee: string): string {
  const result = parseUsdc(amount) - parseUsdc(fee)
  if (result < 0n) throw new Error('Fees exceed bridge amount')
  return formatUsdc(result)
}
