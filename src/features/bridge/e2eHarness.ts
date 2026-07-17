export type BridgeE2EScenario =
  | 'disconnected'
  | 'ethereum'
  | 'base'
  | 'wrong-network'
  | 'estimate-error'
  | 'lifecycle'
  | 'recoverable'
  | 'restored'

export function getBridgeE2EScenario(): BridgeE2EScenario | null {
  const local = window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost'
  if (!local) return null
  const value = new URLSearchParams(window.location.search).get('bridge-e2e')
  const scenarios: BridgeE2EScenario[] = [
    'disconnected',
    'ethereum',
    'base',
    'wrong-network',
    'estimate-error',
    'lifecycle',
    'recoverable',
    'restored',
  ]
  return scenarios.includes(value as BridgeE2EScenario) ? (value as BridgeE2EScenario) : null
}
