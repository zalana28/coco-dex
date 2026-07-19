import { publicAuditError, redactSensitiveText } from './safeError'

export const READ_ONLY_RPC_METHODS = [
  'eth_chainId',
  'eth_blockNumber',
  'eth_getBlockByNumber',
  'eth_getCode',
  'eth_getStorageAt',
  'eth_call',
  'eth_estimateGas',
] as const

export type ReadOnlyRpcMethod = (typeof READ_ONLY_RPC_METHODS)[number]

type FetchLike = (input: string, init: RequestInit) => Promise<{
  ok: boolean
  status?: number
  json: () => Promise<unknown>
}>

type TransportOptions = {
  fetchFn?: FetchLike
  fixedBlockTag?: `0x${string}`
  headers?: Record<string, string>
  logger?: (message: string) => void
  providerLabel?: string
  maxAttempts?: number
  retryDelayMs?: number
}

type JsonRpcEnvelope = {
  result?: unknown
  error?: { code?: number; message?: string }
}

const STATE_BLOCK_TAG_INDEX: Partial<Record<ReadOnlyRpcMethod, number>> = {
  eth_getCode: 1,
  eth_getStorageAt: 2,
  eth_call: 1,
  eth_estimateGas: 1,
}

export { redactSensitiveText } from './safeError'

function assertFixedBlock(method: ReadOnlyRpcMethod, params: readonly unknown[], fixedBlockTag?: `0x${string}`): void {
  const tagIndex = STATE_BLOCK_TAG_INDEX[method]
  if (tagIndex === undefined || !fixedBlockTag) return
  if (params[tagIndex] !== fixedBlockTag) {
    throw new Error(`${method} must use fixed audit block ${fixedBlockTag}; latest or missing block tags are forbidden`)
  }
}

export function createReadOnlyRpcTransport(rpcUrl: string, options: TransportOptions = {}) {
  const allowed = new Set<string>(READ_ONLY_RPC_METHODS)
  const fetchFn = options.fetchFn ?? (globalThis.fetch as unknown as FetchLike)
  const providerLabel = redactSensitiveText(options.providerLabel?.trim() || 'operator-supplied RPC').slice(0, 120)
  let id = 0

  return {
    providerLabel,
    fixedBlockTag: options.fixedBlockTag,
    async request(method: string, params: readonly unknown[]): Promise<unknown> {
      if (!allowed.has(method)) throw new Error(`blocked RPC method: ${method}`)
      const readMethod = method as ReadOnlyRpcMethod
      assertFixedBlock(readMethod, params, options.fixedBlockTag)
      options.logger?.(`RPC read ${readMethod} via ${providerLabel}`)

      const body = JSON.stringify({ jsonrpc: '2.0', id: ++id, method: readMethod, params })
      const maxAttempts = options.maxAttempts ?? 5
      let response: Awaited<ReturnType<FetchLike>> | undefined
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          response = await fetchFn(rpcUrl, {
            method: 'POST',
            headers: { 'content-type': 'application/json', ...options.headers },
            body,
          })
        } catch (error) {
          if (attempt === maxAttempts) {
            throw publicAuditError('RPC transport failed after read-only retries', error, {
              category: 'transport', operation: readMethod, code: 'TRANSPORT_FAILURE', retryable: true,
            })
          }
        }
        const transient = response && (!response.ok && (response.status === 429 || (response.status !== undefined && response.status >= 500)))
        if (response?.ok || !transient || attempt === maxAttempts) break
        await new Promise((resolve) => setTimeout(resolve, (options.retryDelayMs ?? 250) * attempt))
      }
      if (!response?.ok) throw new Error(`RPC transport failed with HTTP ${response?.status ?? 'unknown'}`)
      const envelope = (await response.json()) as JsonRpcEnvelope
      if (envelope.error) {
        throw new Error(`RPC ${readMethod} failed (${envelope.error.code ?? 'unknown'}): ${redactSensitiveText(envelope.error.message ?? 'unknown provider error')}`)
      }
      if (!('result' in envelope)) throw new Error(`RPC ${readMethod} returned malformed JSON-RPC data`)
      return envelope.result
    },
  }
}

export type ReadOnlyRpcTransport = ReturnType<typeof createReadOnlyRpcTransport>
