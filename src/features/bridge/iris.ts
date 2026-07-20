/**
 * CCTP V2 attestation / message polling via Circle's public Iris API.
 *
 * Source domains (CCTP v2 testnet):
 * - Ethereum Sepolia: 0
 * - Base Sepolia: 6
 * - Arc Testnet (destination): 26
 *
 * We only read public message status; no credentials, no signing, no broadcast.
 */

export const CCTP_SOURCE_DOMAINS = {
  Ethereum_Sepolia: 0,
  Base_Sepolia: 6,
} as const

export const ARC_DESTINATION_DOMAIN = 26

const IRIS_BASE_URL = 'https://iris-api.circle.com'

export type AttestationStatus =
  | 'pending'
  | 'attestation-pending'
  | 'attestation-available'
  | 'forwarding-queued'
  | 'forwarding-pending'
  | 'forwarded'
  | 'complete'
  | 'error'

export interface AttestationPollResult {
  status: AttestationStatus
  /** Present once Circle has indexed the burn message. */
  message?: string
  /** Forwarding Service destination tx hash, when available. */
  forwardTxHash?: string
  /** Raw message record, when available (kept minimal: no secrets). */
  raw?: { status?: string; attestationStatus?: string; forwardingStatus?: string }
}

export class IrisPollingError extends Error {
  constructor(message: string, readonly transient: boolean) {
    super(message)
    this.name = 'IrisPollingError'
  }
}

interface IrisMessageResponse {
  messages?: Array<{
    message: string
    attestationStatus?: string
    status?: string
    forwardingStatus?: string
    destinationTxHash?: string
  }>
  error?: string
}

async function fetchMessages(sourceDomain: number, burnTxHash: string, signal?: AbortSignal): Promise<IrisMessageResponse> {
  const url = `${IRIS_BASE_URL}/v2/messages/${sourceDomain}?transactionHash=${encodeURIComponent(burnTxHash)}`
  let res: Response
  try {
    res = await fetch(url, { signal, headers: { accept: 'application/json' } })
  } catch {
    if (signal?.aborted) throw new IrisPollingError('Polling aborted', true)
    throw new IrisPollingError('Network error while checking Circle attestation', true)
  }
  if (res.status === 404) return { messages: [] }
  if (!res.ok) throw new IrisPollingError(`Circle attestation lookup returned ${res.status}`, res.status >= 500)
  try {
    return (await res.json()) as IrisMessageResponse
  } catch {
    throw new IrisPollingError('Could not parse Circle attestation response', true)
  }
}

function interpret(data: IrisMessageResponse): AttestationPollResult {
  const messages = data.messages ?? []
  if (messages.length === 0) return { status: 'pending' }
  const message = messages[0]!
  const status = message.status?.toUpperCase()
  const attestation = message.attestationStatus?.toUpperCase()
  const forwarding = message.forwardingStatus?.toUpperCase()

  if (status === 'COMPLETE' || status === 'DONE') {
    return { status: 'complete', message: message.message, forwardTxHash: message.destinationTxHash, raw: { status, attestationStatus: attestation, forwardingStatus: forwarding } }
  }
  if (forwarding === 'PENDING') {
    return { status: 'forwarding-pending', message: message.message, forwardTxHash: message.destinationTxHash, raw: { status, attestationStatus: attestation, forwardingStatus: forwarding } }
  }
  if (forwarding === 'QUEUED') {
    return { status: 'forwarding-queued', message: message.message, forwardTxHash: message.destinationTxHash, raw: { status, attestationStatus: attestation, forwardingStatus: forwarding } }
  }
  if (attestation === 'PENDING' || status === 'PENDING') {
    return { status: 'attestation-pending', message: message.message, raw: { status, attestationStatus: attestation, forwardingStatus: forwarding } }
  }
  if (attestation === 'COMPLETE' || attestation === 'READY') {
    return { status: 'attestation-available', message: message.message, raw: { status, attestationStatus: attestation, forwardingStatus: forwarding } }
  }
  return { status: 'pending', message: message.message, raw: { status, attestationStatus: attestation, forwardingStatus: forwarding } }
}

/**
 * Poll a single attestation snapshot. Callers handle backoff/abort.
 * Returns a normalized {@link AttestationPollResult}. Never throws for benign
 * 404/empty/pending states — only for transport/auth failures.
 */
export async function pollAttestation(sourceDomain: number, burnTxHash: string, signal?: AbortSignal): Promise<AttestationPollResult> {
  const data = await fetchMessages(sourceDomain, burnTxHash, signal)
  return interpret(data)
}
