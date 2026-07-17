const USDC_AMOUNT_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/

export function safeBridgeAmount(value: string | null) {
  if (!value || !USDC_AMOUNT_PATTERN.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  return BigInt(`${whole}${fraction.padEnd(6, '0')}`) > 0n ? value : null
}

export function bridgeSwapPath(receivedAmount?: string) {
  const params = new URLSearchParams({ from: 'USDC', to: 'EURC', chain: 'Arc_Testnet' })
  const amount = safeBridgeAmount(receivedAmount ?? null)
  if (amount) params.set('amount', amount)
  return `/swap?${params.toString()}`
}

export const bridgeLiquidityPath = '/pools/add'
