import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createPublicClient,
  defineChain,
  formatUnits,
  http,
  isAddress,
  type Abi,
  type Address,
} from 'viem'

const ARC_TESTNET_CHAIN_ID = 5_042_002
const DEFAULT_ARC_RPC_URL = 'https://rpc.testnet.arc.network'

const UNITFLOW_V25_FACTORY = '0xd67F63A4F26a497b364d1C82e6747Aec8B5743a5'
const UNITFLOW_V25_SWAP_ROUTER = '0x4AA8c7Ac458479d9A4FA5c1481e03061ac76824A'
const UNITFLOW_WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df'
const UNITFLOW_V3_QUOTER = '0x121aeB6DEf00F6F67665008CaC1C19805886ed1a'
const UNITFLOW_V4_QUOTER = '0xf9d5Ae3c08602390ea15A3968f2D25cc3c3A7ced'
const UNITFLOW_UNIVERSAL_ROUTER = '0xC43cC6A1E0F6EB48Cd4131522C1C73B13f3Da0F1'
const USDC = '0x3600000000000000000000000000000000000000'
const EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'

const V2_ROUTER_ABI = [
  {
    type: 'function',
    name: 'getAmountsOut',
    stateMutability: 'view',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'path', type: 'address[]' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const satisfies Abi

const V3_QUOTER_ABI = [
  {
    type: 'function',
    name: 'quoteExactInputSingle',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'fee', type: 'uint24' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'sqrtPriceLimitX96', type: 'uint160' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const satisfies Abi

type DebugAddress = {
  label: string
  address: Address
}

type QuoteAttempt = {
  label: string
  contractAddress: Address
  functionName: 'getAmountsOut' | 'quoteExactInputSingle'
  args: readonly unknown[]
  outputDecimals: number
  run: () => Promise<bigint>
}

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
      http: [DEFAULT_ARC_RPC_URL],
    },
  },
  testnet: true,
})

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

function getField(error: unknown, field: string): unknown {
  if (!error || typeof error !== 'object') return undefined
  return (error as Record<string, unknown>)[field]
}

function findNestedField(error: unknown, field: string): unknown {
  if (!error || typeof error !== 'object') return undefined

  const walk = (error as { walk?: (predicate: (value: unknown) => boolean) => unknown }).walk
  if (typeof walk === 'function') {
    const match = walk((value) => Boolean(getField(value, field)))
    return getField(match, field)
  }

  const cause = getField(error, 'cause')
  return getField(cause, field)
}

function printSafeError(error: unknown) {
  console.log('  success: false')
  console.log('  name:', getField(error, 'name') ?? '(none)')
  console.log('  shortMessage:', getField(error, 'shortMessage') ?? '(none)')
  console.log('  details:', getField(error, 'details') ?? '(none)')
  console.log('  metaMessages:', getField(error, 'metaMessages') ?? '(none)')
  console.log('  cause.reason:', findNestedField(error, 'reason') ?? '(none)')
  console.log('  raw data:', findNestedField(error, 'data') ?? getField(error, 'data') ?? '(none)')
}

function printArgs(args: readonly unknown[]) {
  console.dir(args, { depth: 8 })
}

loadEnvLocal()

const rpcUrl = process.env.ARC_TESTNET_RPC_URL || DEFAULT_ARC_RPC_URL
const v25Factory = asAddress('UNITFLOW_V25_FACTORY', UNITFLOW_V25_FACTORY)
const v25SwapRouter = asAddress('UNITFLOW_V25_SWAP_ROUTER', UNITFLOW_V25_SWAP_ROUTER)
const wusdc = asAddress('UNITFLOW_WUSDC', UNITFLOW_WUSDC)
const v3Quoter = asAddress('UNITFLOW_V3_QUOTER', UNITFLOW_V3_QUOTER)
const v4Quoter = asAddress('UNITFLOW_V4_QUOTER', UNITFLOW_V4_QUOTER)
const universalRouter = asAddress('UNITFLOW_UNIVERSAL_ROUTER', UNITFLOW_UNIVERSAL_ROUTER)
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
  { label: 'UnitFlow V2.5 Factory', address: v25Factory },
  { label: 'UnitFlow V2.5 Swap Router', address: v25SwapRouter },
  { label: 'UnitFlow WUSDC', address: wusdc },
  { label: 'UnitFlow V3 Quoter', address: v3Quoter },
  { label: 'UnitFlow V4 Quoter', address: v4Quoter },
  { label: 'UnitFlow UniversalRouter', address: universalRouter },
  { label: 'USDC', address: usdc },
  { label: 'EURC', address: eurc },
]

const oneSixDecimalToken = 1_000_000n
const oneWusdc = 1_000_000_000_000_000_000n
const feeTiers = [100, 500, 3_000, 10_000] as const

const attempts: QuoteAttempt[] = [
  {
    label: 'V2.5 direct USDC -> EURC',
    contractAddress: v25SwapRouter,
    functionName: 'getAmountsOut',
    args: [oneSixDecimalToken, [usdc, eurc]],
    outputDecimals: 6,
    run: async () => {
      const amounts = await client.readContract({
        address: v25SwapRouter,
        abi: V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [oneSixDecimalToken, [usdc, eurc]],
      })
      return amounts[amounts.length - 1] ?? 0n
    },
  },
  {
    label: 'V2.5 direct EURC -> USDC',
    contractAddress: v25SwapRouter,
    functionName: 'getAmountsOut',
    args: [oneSixDecimalToken, [eurc, usdc]],
    outputDecimals: 6,
    run: async () => {
      const amounts = await client.readContract({
        address: v25SwapRouter,
        abi: V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [oneSixDecimalToken, [eurc, usdc]],
      })
      return amounts[amounts.length - 1] ?? 0n
    },
  },
  {
    label: 'V2.5 WUSDC -> EURC',
    contractAddress: v25SwapRouter,
    functionName: 'getAmountsOut',
    args: [oneWusdc, [wusdc, eurc]],
    outputDecimals: 6,
    run: async () => {
      const amounts = await client.readContract({
        address: v25SwapRouter,
        abi: V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [oneWusdc, [wusdc, eurc]],
      })
      return amounts[amounts.length - 1] ?? 0n
    },
  },
  {
    label: 'V2.5 EURC -> WUSDC',
    contractAddress: v25SwapRouter,
    functionName: 'getAmountsOut',
    args: [oneSixDecimalToken, [eurc, wusdc]],
    outputDecimals: 18,
    run: async () => {
      const amounts = await client.readContract({
        address: v25SwapRouter,
        abi: V2_ROUTER_ABI,
        functionName: 'getAmountsOut',
        args: [oneSixDecimalToken, [eurc, wusdc]],
      })
      return amounts[amounts.length - 1] ?? 0n
    },
  },
]

for (const fee of feeTiers) {
  attempts.push(
    {
      label: `V3 USDC -> EURC fee ${fee}`,
      contractAddress: v3Quoter,
      functionName: 'quoteExactInputSingle',
      args: [usdc, eurc, fee, oneSixDecimalToken, 0n],
      outputDecimals: 6,
      run: () => client.readContract({
        address: v3Quoter,
        abi: V3_QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [usdc, eurc, fee, oneSixDecimalToken, 0n],
      }),
    },
    {
      label: `V3 EURC -> USDC fee ${fee}`,
      contractAddress: v3Quoter,
      functionName: 'quoteExactInputSingle',
      args: [eurc, usdc, fee, oneSixDecimalToken, 0n],
      outputDecimals: 6,
      run: () => client.readContract({
        address: v3Quoter,
        abi: V3_QUOTER_ABI,
        functionName: 'quoteExactInputSingle',
        args: [eurc, usdc, fee, oneSixDecimalToken, 0n],
      }),
    },
  )
}

console.log('UnitFlow quote diagnostic')
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
console.log('UniversalRouter note:')
console.log(`  address: ${universalRouter}`)
console.log('  No swap execution attempted. Execution would require Permit2 approval/signature flow and UniversalRouter command/input encoding.')
console.log('')

for (const attempt of attempts) {
  console.log(attempt.label)
  console.log('  contract address:', attempt.contractAddress)
  console.log('  function name:', attempt.functionName)
  console.log('  args:')
  printArgs(attempt.args)

  try {
    const amountOut = await attempt.run()
    console.log('  success: true')
    console.log('  quoted amountOut:', amountOut.toString())
    console.log('  quoted amountOut formatted:', formatUnits(amountOut, attempt.outputDecimals))
  } catch (error) {
    printSafeError(error)
  }

  console.log('')
}
