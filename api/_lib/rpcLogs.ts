import type { Address } from 'viem'

type LogQuery = {
  address: Address | Address[]
  events: readonly unknown[]
}

type LogClient<TLog> = {
  getLogs(parameters: LogQuery & { fromBlock: bigint; toBlock: bigint }): Promise<TLog[]>
}

type RetryCategory = 'rate_limit' | 'timeout' | 'gateway' | 'network'
type LogEntry = Record<string, unknown>

export type RpcLogOptions = {
  maxAttempts?: number
  baseDelayMs?: number
  maxDelayMs?: number
  providerUrl?: string
  sleep?: (delayMs: number) => Promise<void>
  random?: () => number
  log?: (entry: LogEntry) => void
}

const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_BASE_DELAY_MS = 250
const DEFAULT_MAX_DELAY_MS = 2_000

function messageOf(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function sanitizeRpcError(error: unknown) {
  return messageOf(error)
    .replace(/https?:\/\/[^\s)\]}]+/gi, (url) => {
      try { return new URL(url).hostname } catch { return '[rpc-host]' }
    })
    .replace(/authorization\s*:\s*(?:bearer\s+)?[^\s,;]+/gi, '[credential-redacted]')
    .replace(/(?:api[_-]?key|token|secret)\s*[=:]\s*[^\s,;]+/gi, '[credential-redacted]')
}

function isRangeTooLarge(error: unknown) {
  return /(?:block|query|log|response).{0,60}(?:range|size).{0,60}(?:too large|exceed|maximum|max|up to)|(?:maximum|max|up to).{0,20}\d+.{0,20}blocks|more than.{0,20}blocks/i.test(messageOf(error))
}

function retryCategory(error: unknown): RetryCategory | null {
  const message = messageOf(error)
  if (/\b429\b|rate.?limit|too many requests/i.test(message)) return 'rate_limit'
  if (/timeout|timed out|ETIMEDOUT|AbortError/i.test(message)) return 'timeout'
  if (/\b50[234]\b|bad gateway|service unavailable|gateway timeout/i.test(message)) return 'gateway'
  if (/ECONNRESET|ECONNREFUSED|EAI_AGAIN|fetch failed|network error|socket hang up/i.test(message)) return 'network'
  return null
}

function providerHostname(providerUrl?: string) {
  if (!providerUrl) return undefined
  try {
    return new URL(providerUrl).hostname
  } catch {
    return undefined
  }
}

function backoffDelay(attempt: number, baseDelayMs: number, maxDelayMs: number, random: () => number) {
  const exponential = Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1))
  return Math.round(exponential * (0.5 + random() * 0.5))
}

async function fetchRange<TLog>(
  client: LogClient<TLog>,
  query: LogQuery,
  fromBlock: bigint,
  toBlock: bigint,
  options: Required<Pick<RpcLogOptions, 'maxAttempts' | 'baseDelayMs' | 'maxDelayMs' | 'sleep' | 'random' | 'log'>> & Pick<RpcLogOptions, 'providerUrl'>,
): Promise<TLog[]> {
  for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
    try {
      return await client.getLogs({ ...query, fromBlock, toBlock })
    } catch (error) {
      if (isRangeTooLarge(error)) {
        if (fromBlock === toBlock) throw new Error('RPC eth_getLogs rejected a single-block range (range_too_large)', { cause: error })
        const midpoint = fromBlock + (toBlock - fromBlock) / 2n
        const left = await fetchRange(client, query, fromBlock, midpoint, options)
        const right = await fetchRange(client, query, midpoint + 1n, toBlock, options)
        return [...left, ...right]
      }

      const category = retryCategory(error)
      if (!category) throw new Error('RPC eth_getLogs failed (non_retryable)', { cause: error })
      if (attempt === options.maxAttempts) {
        options.log({
          event: 'rpc_get_logs_failed',
          provider: providerHostname(options.providerUrl),
          method: 'eth_getLogs',
          fromBlock: Number(fromBlock),
          toBlock: Number(toBlock),
          category,
          retryCount: attempt - 1,
        })
        throw new Error(`RPC eth_getLogs failed after ${attempt} attempts (${category})`, { cause: error })
      }

      const delayMs = backoffDelay(attempt, options.baseDelayMs, options.maxDelayMs, options.random)
      options.log({
        event: 'rpc_get_logs_retry',
        provider: providerHostname(options.providerUrl),
        method: 'eth_getLogs',
        fromBlock: Number(fromBlock),
        toBlock: Number(toBlock),
        category,
        retryCount: attempt,
        delayMs,
      })
      await options.sleep(delayMs)
    }
  }
  throw new Error('RPC eth_getLogs failed (retry_exhausted)')
}

export function fetchLogsResilient<TLog>(
  client: LogClient<TLog>,
  query: LogQuery,
  fromBlock: bigint,
  toBlock: bigint,
  options: RpcLogOptions = {},
) {
  if (fromBlock > toBlock) throw new Error('RPC eth_getLogs range must not be empty')
  return fetchRange(client, query, fromBlock, toBlock, {
    maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    baseDelayMs: options.baseDelayMs ?? DEFAULT_BASE_DELAY_MS,
    maxDelayMs: options.maxDelayMs ?? DEFAULT_MAX_DELAY_MS,
    providerUrl: options.providerUrl,
    sleep: options.sleep ?? ((delayMs) => new Promise((resolve) => setTimeout(resolve, delayMs))),
    random: options.random ?? Math.random,
    log: options.log ?? ((entry) => console.log(JSON.stringify(entry))),
  })
}

export function productionRpcLogOptions(): RpcLogOptions {
  return { providerUrl: process.env.ARC_TESTNET_RPC_URL }
}
