import { ArcTestnet, BaseSepolia, BridgeKit, EthereumSepolia, type BridgeResult, type EstimateResult } from '@circle-fin/bridge-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { normalizeUsdc } from './amounts'
import type { SourceChain } from './chains'
import { classifyBridgeError, type SafeBridgeError } from './errors'
import { buildBridgeParams, buildRetryContext } from './params'

export interface BridgeFacadeInput {
  provider: EIP1193Provider
  source: SourceChain
  recipient: string
  amount: string
  mode: 'SLOW' | 'FAST'
  traceId?: string
  wallet: string
  onBurn?: (result: BridgeResult) => void
}

type AdapterFactory = typeof createViemAdapterFromProvider
export interface BridgeFacadeDependencies {
  kit?: BridgeKit
  createAdapter?: AdapterFactory
  onBurnObserved?: (result: BridgeResult) => void
}

export interface BridgeFacade {
  estimate(input: BridgeFacadeInput): Promise<EstimateResult>
  bridge(input: BridgeFacadeInput): Promise<BridgeResult>
  retryBridge(result: BridgeResult, input: BridgeFacadeInput): Promise<BridgeResult>
  toSafeError(error: unknown): SafeBridgeError
}

function invocationMeta(traceId?: string) {
  return traceId ? { traceId } : undefined
}

function burnResult(event: unknown, input: BridgeFacadeInput): BridgeResult | null {
  const payload = event && typeof event === 'object' && 'values' in event ? (event as { values?: unknown }).values : null
  if (!payload || typeof payload !== 'object' || !('state' in payload) || payload.state !== 'success') return null
  const sourceChain = input.source === 'Ethereum_Sepolia' ? EthereumSepolia : BaseSepolia
  return {
    amount: normalizeUsdc(input.amount),
    token: 'USDC',
    state: 'pending',
    provider: 'CCTPV2BridgingProvider',
    source: { address: input.wallet, chain: sourceChain },
    destination: { address: input.recipient, recipientAddress: input.recipient, useForwarder: true, chain: ArcTestnet },
    config: { transferSpeed: input.mode, batchTransactions: false },
    steps: [payload as BridgeResult['steps'][number]],
  }
}

/**
 * Build the canonical SDK params used identically by estimate and bridge. The
 * same object reference is passed to both `kit.estimate` and `kit.bridge`, so a
 * Standard transfer can never submit different recipient/forwarding/speed values
 * than it estimated.
 */
async function buildInputParams(input: BridgeFacadeInput, createAdapter: AdapterFactory) {
  const adapter = await createAdapter({ provider: input.provider, capabilities: { addressContext: 'user-controlled' } })
  return {
    adapter,
    params: buildBridgeParams({
      adapter,
      source: input.source,
      recipient: input.recipient,
      amount: input.amount,
      speed: input.mode,
      useForwarder: true,
      traceId: input.traceId,
    }),
  }
}

export function createBridgeFacade(dependencies: BridgeFacadeDependencies = {}): BridgeFacade {
  const kit = dependencies.kit ?? new BridgeKit()
  const createAdapter = dependencies.createAdapter ?? createViemAdapterFromProvider
  return {
    async estimate(input) {
      const { params } = await buildInputParams(input, createAdapter)
      return kit.estimate(params)
    },
    async bridge(input) {
      const { params } = await buildInputParams(input, createAdapter)
      const burnHandler = (event: unknown) => {
        const result = burnResult(event, input)
        if (result) input.onBurn?.(result)
      }
      kit.on('burn', burnHandler)
      let output: BridgeResult
      try {
        output = await kit.bridge(params)
      } finally {
        kit.off('burn', burnHandler)
      }
      if (output.steps.some((step) => step.name.replace(/[\s_-]/g, '').toLowerCase() === 'burn' && step.state === 'success')) {
        dependencies.onBurnObserved?.(output)
      }
      return output
    },
    async retryBridge(result, input) {
      const { adapter } = await buildInputParams(input, createAdapter)
      const output = await kit.retry(result, buildRetryContext(adapter), invocationMeta(input.traceId))
      if (output.steps.some((step) => step.name.replace(/[\s_-]/g, '').toLowerCase() === 'burn' && step.state === 'success')) {
        dependencies.onBurnObserved?.(output)
      }
      return output
    },
    toSafeError: classifyBridgeError,
  }
}

export const bridgeFacade = createBridgeFacade()
