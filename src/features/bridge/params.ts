import { type BridgeParams, type TransferSpeed } from '@circle-fin/bridge-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { normalizeUsdc } from './amounts'
import type { SourceChain } from './chains'

export type BridgeTransferSpeed = TransferSpeed | `${TransferSpeed}`

/** The adapter type produced by the installed createViemAdapterFromProvider. */
export type ViemAdapterInstance = Awaited<ReturnType<typeof createViemAdapterFromProvider>>

export interface BuildBridgeParamsInput {
  adapter: ViemAdapterInstance
  source: SourceChain
  recipient: string
  amount: string
  speed: BridgeTransferSpeed
  useForwarder?: boolean
  traceId?: string
}

/**
 * Build the canonical SDK {@link BridgeParams} used unchanged by BOTH
 * estimate and bridge. The exact same object is passed to estimation and
 * execution; only the adapter is constructed once per call. This guarantees the
 * estimate and the executed transfer can never silently diverge in recipient,
 * forwarding mode, speed, or amount.
 *
 * Semantics:
 * - Standard (`SLOW`) is the default and carries `useForwarder: true` for the
 *   Circle Forwarding Service (no Arc destination gas required). When forwarding
 *   is enabled with the source adapter, Circle's Orbit relayer fetches the
 *   attestation and submits the Arc mint; the relay fee is deducted from the
 *   minted USDC at mint time.
 * - `recipientAddress` is passed on the destination so minted USDC lands on the
 *   correct Arc account.
 * - Batching is disabled (`batchTransactions: false`) so the approve and burn
 *   steps are explicit and observable.
 */
export function buildBridgeParams(input: BuildBridgeParamsInput): BridgeParams {
  const useForwarder = input.useForwarder ?? true
  const params: BridgeParams = {
    from: { adapter: input.adapter, chain: input.source },
    to: {
      adapter: input.adapter,
      chain: 'Arc_Testnet' as const,
      recipientAddress: input.recipient,
      useForwarder,
    },
    amount: normalizeUsdc(input.amount),
    token: 'USDC',
    config: {
      transferSpeed: input.speed,
      batchTransactions: false,
    },
  }
  if (input.traceId) {
    params.invocationMeta = { traceId: input.traceId }
  }
  return params
}

/**
 * Recreate the retry context from a fresh source adapter so that
 * {@link import('@circle-fin/bridge-kit').BridgeKit.retry} resumes the exact
 * original burn (no re-burn). The destination adapter is omitted for forwarded
 * mints per SDK guidance (forwarder-only destination).
 */
export function buildRetryContext(adapter: ViemAdapterInstance) {
  return { from: adapter, to: undefined } as const
}

export type { EIP1193Provider }
