import { ArcTestnet, BaseSepolia, BridgeKit, EthereumSepolia, TransferSpeed, type BridgeResult, type EstimateResult } from '@circle-fin/bridge-kit'
import { createViemAdapterFromProvider } from '@circle-fin/adapter-viem-v2'
import type { EIP1193Provider } from 'viem'
import { normalizeUsdc } from './amounts'
import type { SourceChain } from './chains'
import { classifyBridgeError, type SafeBridgeError } from './errors'

export interface BridgeFacadeInput {
  provider: EIP1193Provider
  source: SourceChain
  recipient: string
  amount: string
  mode: TransferSpeed | `${TransferSpeed}`
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

function invocationMeta(traceId?: string) { return traceId ? { traceId } : undefined }

function burnResult(event: unknown, input: BridgeFacadeInput): BridgeResult | null {
  const payload = event && typeof event === 'object' && 'values' in event ? (event as { values?: unknown }).values : null
  if (!payload || typeof payload !== 'object' || !('state' in payload) || payload.state !== 'success') return null
  const sourceChain = input.source === 'Ethereum_Sepolia' ? EthereumSepolia : BaseSepolia
  return {
    amount: normalizeUsdc(input.amount), token: 'USDC', state: 'pending', provider: 'CCTPV2BridgingProvider',
    source: { address: input.wallet, chain: sourceChain },
    destination: { address: input.recipient, recipientAddress: input.recipient, useForwarder: true, chain: ArcTestnet },
    config: { transferSpeed: input.mode, batchTransactions: false },
    steps: [payload as BridgeResult['steps'][number]],
  }
}

export function createBridgeFacade(dependencies: BridgeFacadeDependencies = {}): BridgeFacade {
  const kit = dependencies.kit ?? new BridgeKit()
  const createAdapter = dependencies.createAdapter ?? createViemAdapterFromProvider
  const params = async (input: BridgeFacadeInput) => {
    const adapter = await createAdapter({ provider: input.provider, capabilities: { addressContext: 'user-controlled' } })
    return {
      adapter,
      sdk: {
        from: { adapter, chain: input.source },
        to: { chain: 'Arc_Testnet' as const, recipientAddress: input.recipient, useForwarder: true as const },
        amount: normalizeUsdc(input.amount), token: 'USDC' as const,
        config: { transferSpeed: input.mode, batchTransactions: false },
        invocationMeta: invocationMeta(input.traceId),
      },
    }
  }
  return {
    async estimate(input) { return kit.estimate((await params(input)).sdk) },
    async bridge(input) {
      const burnHandler = (event: unknown) => {
        const result = burnResult(event, input)
        if (result) input.onBurn?.(result)
      }
      kit.on('burn', burnHandler)
      let output: BridgeResult
      try { output = await kit.bridge((await params(input)).sdk) }
      finally { kit.off('burn', burnHandler) }
      if (output.steps.some((step) => step.name.replace(/[\s_-]/g, '').toLowerCase() === 'burn' && step.state === 'success')) dependencies.onBurnObserved?.(output)
      return output
    },
    async retryBridge(result, input) {
      const { adapter } = await params(input)
      const output = await kit.retry(result, { from: adapter, to: undefined }, invocationMeta(input.traceId))
      if (output.steps.some((step) => step.name.replace(/[\s_-]/g, '').toLowerCase() === 'burn' && step.state === 'success')) dependencies.onBurnObserved?.(output)
      return output
    },
    toSafeError: classifyBridgeError,
  }
}

export const bridgeFacade = createBridgeFacade()
