export type SafeErrorMetadata = Readonly<{
  category: 'transport' | 'rpc' | 'validation' | 'report' | 'unknown'
  operation?: string
  providerId?: string
  code?: string
  retryable: boolean
  reasons: readonly string[]
}>

const MAX_CAUSE_DEPTH = 5
const MAX_REASON_LENGTH = 500

export function redactSensitiveText(value: string): string {
  return value
    .replace(/https?:\/\/[^\s"'<>]+/gi, '[REDACTED_URL]')
    .replace(/(?:\/Users|\/home)\/[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+/g, '[REDACTED_PATH]')
    .replace(/\b(?:authorization|cookie|api[_-]?key|token|secret|password)\s*[:=]\s*(?:bearer\s+)?[^\s,;]+/gi, '$1=[REDACTED]')
    .replace(/\bBearer\s+[A-Za-z0-9._+/-]+/gi, 'Bearer [REDACTED]')
    .slice(0, MAX_REASON_LENGTH)
}

function safeReason(value: unknown): string {
  if (value instanceof Error) return redactSensitiveText(value.message || value.name)
  if (typeof value === 'string') return redactSensitiveText(value)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    for (const key of ['message', 'reason', 'details', 'code']) {
      if (typeof record[key] === 'string' || typeof record[key] === 'number') return redactSensitiveText(String(record[key]))
    }
    return 'non-error object'
  }
  return redactSensitiveText(String(value))
}

export function summarizeCauseChain(value: unknown): readonly string[] {
  const reasons: string[] = []
  const seen = new WeakSet<object>()
  let current: unknown = value
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && current !== undefined && current !== null; depth += 1) {
    if (typeof current === 'object') {
      if (seen.has(current)) {
        reasons.push('[CYCLIC_CAUSE]')
        break
      }
      seen.add(current)
    }
    reasons.push(safeReason(current))
    if (current instanceof Error) current = (current as Error & { cause?: unknown }).cause
    else if (typeof current === 'object') current = (current as Record<string, unknown>).cause
    else break
  }
  return Object.freeze(reasons)
}

export class PublicAuditError extends Error {
  readonly metadata: SafeErrorMetadata

  constructor(message: string, metadata: Omit<SafeErrorMetadata, 'reasons'> & { reasons?: readonly string[] }) {
    const safeMessage = redactSensitiveText(message)
    super(safeMessage)
    this.name = 'PublicAuditError'
    this.stack = `${this.name}: ${safeMessage}`
    this.metadata = Object.freeze({ ...metadata, reasons: Object.freeze([...(metadata.reasons ?? [])].map(redactSensitiveText)) })
  }

  toJSON() {
    return { name: this.name, message: this.message, metadata: this.metadata }
  }
}

export function publicAuditError(
  message: string,
  source: unknown,
  metadata: Omit<SafeErrorMetadata, 'reasons'>,
): PublicAuditError {
  return new PublicAuditError(message, { ...metadata, reasons: summarizeCauseChain(source) })
}

export function safeErrorMarkdown(error: PublicAuditError): string {
  return [
    `- Error: ${error.message}`,
    `- Category: ${error.metadata.category}`,
    `- Operation: ${error.metadata.operation ?? 'unknown'}`,
    `- Retryable: ${error.metadata.retryable}`,
    ...error.metadata.reasons.map((reason) => `- Reason: ${reason}`),
  ].join('\n')
}

export function safeErrorCliText(error: unknown): string {
  if (error instanceof PublicAuditError) return `${error.name}: ${error.message}\n${safeErrorMarkdown(error)}`
  return `PublicAuditError: ${redactSensitiveText(error instanceof Error ? error.message : String(error))}`
}
