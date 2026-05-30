import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPublicClient, defineChain, http, isAddress, type Address } from 'viem'

const ARC_TESTNET_CHAIN_ID = 5_042_002
const ROUTER = '0x73742278c31a76dBb0D2587d03ef92E6E2141023'
const USDC_EURC_POOL = '0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1'
const USDC = '0x3600000000000000000000000000000000000000'
const EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'

/**
 * Corrected ABI: getAmountOut takes 3 params (tokenIn, tokenOut, amountIn).
 * The router resolves the pool internally — no pool address parameter needed.
 * Selector: 0x4aa06652
 */
const XYLONET_ROUTER_ABI = [
  {
    type: 'function',
    name: 'getAmountOut',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const ERC20_ABI = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const

const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: {
    name: 'USD Coin',
    symbol: 'USDC',
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ['https://rpc.testnet.arc.network'],
    },
  },
  testnet: true,
})

type DebugAddress = {
  label: string
  address: Address
}

type QuoteCase = {
  label: string
  tokenIn: Address
  tokenOut: Address
  amountIn: bigint
}

function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return

  const contents = readFileSync(envPath, 'utf8')
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue

    const separatorIndex = trimmed.indexOf('=')
    if (separatorIndex === -1) continue

    const key = trimmed.slice(0, separatorIndex).trim()
    let value = trimmed.slice(separatorIndex + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }

    process.env[key] ??= value
  }
}

function asAddress(label: string, value: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${label} is not a valid address: ${value}`)
  }
  return value
}

function getErrorField(error: unknown, field: string): unknown {
  if (!error || typeof error !== 'object') return undefined
  return (error as Record<string, unknown>)[field]
}

function getNestedCause(error: unknown): unknown {
  return getErrorField(error, 'cause')
}

function getRevertReason(error: unknown): unknown {
  if (!error || typeof error !== 'object') return undefined

  const walk = (error as { walk?: (predicate: (value: unknown) => boolean) => unknown }).walk
  if (typeof walk !== 'function') return undefined

  const reasonError = walk((value) => Boolean(getErrorField(value, 'reason')))
  return getErrorField(reasonError, 'reason')
}

function printReadError(error: unknown) {
  console.log('  shortMessage:', getErrorField(error, 'shortMessage') ?? '(none)')
  console.log('  details:', getErrorField(error, 'details') ?? '(none)')
  console.log('  revertReason:', getRevertReason(error) ?? '(none)')
  console.log('  cause:')
  console.dir(getNestedCause(error) ?? '(none)', { depth: 8 })
  console.log('  fullError:')
  console.dir(error, { depth: 8 })
}

loadEnvLocal()

const rpcUrl = process.env.ARC_TESTNET_RPC_URL
if (!rpcUrl) {
  throw new Error('ARC_TESTNET_RPC_URL is required in .env.local')
}

const router = asAddress('ROUTER', ROUTER)
const pool = asAddress('USDC_EURC_POOL', USDC_EURC_POOL)
const usdc = asAddress('USDC', USDC)
const eurc = asAddress('EURC', EURC)

const client = createPublicClient({
  chain: {
    ...arcTestnet,
    rpcUrls: {
      default: {
        http: [rpcUrl],
      },
    },
  },
  transport: http(rpcUrl),
})

const addresses: DebugAddress[] = [
  { label: 'XyloNet router', address: router },
  { label: 'XyloNet USDC/EURC pool', address: pool },
  { label: 'USDC', address: usdc },
  { label: 'EURC', address: eurc },
]

console.log('XyloNet quote diagnostic')
console.log('chainId:', ARC_TESTNET_CHAIN_ID)
console.log('rpcUrl:', rpcUrl)
console.log('')

for (const item of addresses) {
  const bytecode = await client.getBytecode({ address: item.address })
  const byteLength = bytecode ? (bytecode.length - 2) / 2 : 0
  console.log(`${item.label}: ${item.address}`)
  console.log(`  bytecode exists: ${byteLength > 0}`)
  console.log(`  bytecode bytes: ${byteLength}`)
}

console.log('')

let eurcDecimals: number | undefined
try {
  eurcDecimals = await client.readContract({
    address: eurc,
    abi: ERC20_ABI,
    functionName: 'decimals',
  })
  console.log('EURC decimals:', eurcDecimals)
} catch (error) {
  console.log('EURC decimals read failed')
  printReadError(error)
}

const quoteCases: QuoteCase[] = [
  { label: '1 USDC -> EURC', tokenIn: usdc, tokenOut: eurc, amountIn: 1_000_000n },
  { label: '10 USDC -> EURC', tokenIn: usdc, tokenOut: eurc, amountIn: 10_000_000n },
]

if (eurcDecimals === 6) {
  quoteCases.push({ label: '1 EURC -> USDC', tokenIn: eurc, tokenOut: usdc, amountIn: 1_000_000n })
} else {
  console.log('Skipping 1 EURC -> USDC because EURC decimals is not confirmed as 6.')
}

console.log('')

for (const quoteCase of quoteCases) {
  console.log(quoteCase.label)
  console.log(`  amountIn: ${quoteCase.amountIn}`)

  try {
    const amountOut = await client.readContract({
      address: router,
      abi: XYLONET_ROUTER_ABI,
      functionName: 'getAmountOut',
      args: [quoteCase.tokenIn, quoteCase.tokenOut, quoteCase.amountIn],
    })

    console.log(`  amountOut: ${amountOut}`)
  } catch (error) {
    console.log('  readContract failed')
    printReadError(error)
  }
}
