export type BridgeErrorCategory = 'user-rejected' | 'validation' | 'wallet' | 'network' | 'onchain' | 'unknown'
export interface SafeBridgeError { category: BridgeErrorCategory; recoverable: boolean; message: string; code?: string | number }

const SECRET = /(api[_-]?key|token|secret|authorization|password)=([^\s&]+)/gi
const BEARER = /bearer\s+[a-z0-9._~+/-]+=*/gi
const PRIVATE_DATA = /0x[a-fA-F0-9]{64}/g

export function redactErrorMessage(input: string): string {
  return input.replace(SECRET, '$1=[REDACTED]').replace(BEARER, 'Bearer [REDACTED]').replace(PRIVATE_DATA, '[REDACTED_HEX]')
}

export function classifyBridgeError(error: unknown): SafeBridgeError {
  const record = typeof error === 'object' && error !== null ? error as Record<string, unknown> : {}
  const code = typeof record.code === 'string' || typeof record.code === 'number' ? record.code : undefined
  const raw = typeof record.message === 'string' ? record.message : error instanceof Error ? error.message : 'Bridge operation failed'
  const message = redactErrorMessage(raw).slice(0, 500)
  const lower = message.toLowerCase()
  if (code === 4001 || lower.includes('user rejected') || lower.includes('denied')) return { category: 'user-rejected', recoverable: false, message, code }
  if (lower.includes('invalid') || lower.includes('unsupported route')) return { category: 'validation', recoverable: false, message, code }
  if (lower.includes('wallet') || lower.includes('account') || lower.includes('connector')) return { category: 'wallet', recoverable: true, message, code }
  if (lower.includes('rpc') || lower.includes('network') || lower.includes('timeout') || lower.includes('fetch')) return { category: 'network', recoverable: true, message, code }
  if (lower.includes('revert') || lower.includes('onchain') || lower.includes('gas')) return { category: 'onchain', recoverable: true, message, code }
  return { category: 'unknown', recoverable: true, message, code }
}
