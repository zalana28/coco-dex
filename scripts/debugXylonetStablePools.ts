import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPublicClient, defineChain, formatUnits, http, isAddress, type Abi, type Address } from 'viem'

const ARC_TESTNET_CHAIN_ID = 5_042_002
const DEFAULT_RPC_URL = 'https://rpc.testnet.arc.network'

const ROUTER = '0x73742278c31a76dBb0D2587d03ef92E6E2141023'
const USDC_EURC_POOL = '0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1'
const USDC_USYC_POOL = '0x8296cC7477A9CD12cF632042fDDc2aB89151bb61'
const USDC = '0x3600000000000000000000000000000000000000'
const EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const USYC = '0xe9185F0c5F296Ed1797AaE4238D26CCaBEadb86C'

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
      http: [DEFAULT_RPC_URL],
    },
  },
  testnet: true,
})

const ERC20_ABI = [
  {
    type: 'function',
    name: 'symbol',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'name',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'string' }],
  },
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

const POOL_READ_ABI = [
  {
    type: 'function',
    name: 'getReserves',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'reserve0', type: 'uint112' },
      { name: 'reserve1', type: 'uint112' },
      { name: 'blockTimestampLast', type: 'uint32' },
    ],
  },
  {
    type: 'function',
    name: 'token0',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'token1',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'coins',
    stateMutability: 'view',
    inputs: [{ name: 'i', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'tokens',
    stateMutability: 'view',
    inputs: [{ name: 'i', type: 'uint256' }],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'balances',
    stateMutability: 'view',
    inputs: [{ name: 'i', type: 'uint256' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'fee',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'get_virtual_price',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'A',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'amp',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'amplification',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

type KnownToken = {
  label: string
  address: Address
}

type PoolConfig = {
  label: string
  address: Address
  tokens: KnownToken[]
}

type ReadAttempt = {
  label: string
  functionName: string
  args?: readonly unknown[]
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

function getShortError(error: unknown): string {
  const shortMessage = getErrorField(error, 'shortMessage')
  if (typeof shortMessage === 'string') return shortMessage
  const message = getErrorField(error, 'message')
  if (typeof message === 'string') return message.split('\n')[0] ?? message
  return String(error)
}

function formatValue(value: unknown): string {
  if (typeof value === 'bigint') return value.toString()
  if (Array.isArray(value)) return `[${value.map(formatValue).join(', ')}]`
  return String(value)
}

loadEnvLocal()

const rpcUrl = process.env.ARC_TESTNET_RPC_URL || DEFAULT_RPC_URL
const debugAccount = process.env.XYLONET_POOL_DEBUG_ACCOUNT

const router = asAddress('ROUTER', ROUTER)
const usdc = asAddress('USDC', USDC)
const eurc = asAddress('EURC', EURC)
const usyc = asAddress('USYC', USYC)

const pools: PoolConfig[] = [
  {
    label: 'USDC/EURC',
    address: asAddress('USDC_EURC_POOL', USDC_EURC_POOL),
    tokens: [
      { label: 'USDC', address: usdc },
      { label: 'EURC', address: eurc },
    ],
  },
  {
    label: 'USDC/USYC',
    address: asAddress('USDC_USYC_POOL', USDC_USYC_POOL),
    tokens: [
      { label: 'USDC', address: usdc },
      { label: 'USYC', address: usyc },
    ],
  },
]

const account = debugAccount ? asAddress('XYLONET_POOL_DEBUG_ACCOUNT', debugAccount) : undefined

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

async function readContract(address: Address, abi: Abi, functionName: string, args?: readonly unknown[]) {
  return client.readContract({
    address,
    abi,
    functionName,
    args,
  })
}

async function readToken(token: KnownToken) {
  console.log(`${token.label}: ${token.address}`)

  const [symbolResult, decimalsResult] = await Promise.allSettled([
    readContract(token.address, ERC20_ABI, 'symbol'),
    readContract(token.address, ERC20_ABI, 'decimals'),
  ])

  if (symbolResult.status === 'fulfilled') {
    console.log(`  symbol: ${formatValue(symbolResult.value)}`)
  } else {
    console.log(`  symbol: failed (${getShortError(symbolResult.reason)})`)
  }

  if (decimalsResult.status === 'fulfilled') {
    console.log(`  decimals: ${formatValue(decimalsResult.value)}`)
  } else {
    console.log(`  decimals: failed (${getShortError(decimalsResult.reason)})`)
  }
}

async function inspectPool(pool: PoolConfig) {
  console.log('')
  console.log(`Pool: ${pool.label}`)
  console.log(`  pool address: ${pool.address}`)
  console.log(`  router address: ${router}`)
  for (const token of pool.tokens) {
    console.log(`  ${token.label}: ${token.address}`)
  }

  const bytecode = await client.getBytecode({ address: pool.address })
  const byteLength = bytecode ? (bytecode.length - 2) / 2 : 0
  console.log(`  bytecode exists: ${byteLength > 0}`)
  console.log(`  bytecode bytes: ${byteLength}`)

  const attempts: ReadAttempt[] = [
    { label: 'token0', functionName: 'token0' },
    { label: 'token1', functionName: 'token1' },
    { label: 'coins(0)', functionName: 'coins', args: [0n] },
    { label: 'coins(1)', functionName: 'coins', args: [1n] },
    { label: 'tokens(0)', functionName: 'tokens', args: [0n] },
    { label: 'tokens(1)', functionName: 'tokens', args: [1n] },
    { label: 'balances(0)', functionName: 'balances', args: [0n] },
    { label: 'balances(1)', functionName: 'balances', args: [1n] },
    { label: 'getReserves', functionName: 'getReserves' },
    { label: 'totalSupply', functionName: 'totalSupply' },
    { label: 'fee', functionName: 'fee' },
    { label: 'get_virtual_price', functionName: 'get_virtual_price' },
    { label: 'A', functionName: 'A' },
    { label: 'amp', functionName: 'amp' },
    { label: 'amplification', functionName: 'amplification' },
  ]

  const detected: string[] = []
  const failed: string[] = []

  for (const token of pool.tokens) {
    try {
      const value = await readContract(token.address, ERC20_ABI, 'balanceOf', [pool.address])
      detected.push(`${token.label}.balanceOf(pool)`)
      console.log(`  ${token.label} balance held by pool: ${formatValue(value)}`)
      if (typeof value === 'bigint') {
        console.log(`    formatted as 6 decimals: ${formatUnits(value, 6)}`)
      }
    } catch (error) {
      failed.push(`${token.label}.balanceOf(pool): ${getShortError(error)}`)
    }
  }

  for (const attempt of attempts) {
    const abi = attempt.functionName === 'totalSupply' ? ERC20_ABI : POOL_READ_ABI
    try {
      const value = await readContract(pool.address, abi, attempt.functionName, attempt.args)
      detected.push(attempt.label)
      console.log(`  ${attempt.label}: ${formatValue(value)}`)
      if (attempt.label.startsWith('balances') && typeof value === 'bigint') {
        console.log(`    formatted as 6 decimals: ${formatUnits(value, 6)}`)
      }
      if (attempt.label === 'totalSupply' && typeof value === 'bigint') {
        console.log(`    formatted as 18 decimals: ${formatUnits(value, 18)}`)
      }
    } catch (error) {
      failed.push(`${attempt.label}: ${getShortError(error)}`)
    }
  }

  if (account) {
    try {
      const value = await readContract(pool.address, ERC20_ABI, 'balanceOf', [account])
      detected.push('balanceOf(debugAccount)')
      console.log(`  user LP balance (${account}): ${formatValue(value)}`)
      if (typeof value === 'bigint') {
        console.log(`    formatted as 18 decimals: ${formatUnits(value, 18)}`)
      }
    } catch (error) {
      failed.push(`balanceOf(debugAccount): ${getShortError(error)}`)
    }
  } else {
    console.log('  user LP balance: skipped (set XYLONET_POOL_DEBUG_ACCOUNT to read one)')
  }

  console.log('  detected read functions that worked:')
  for (const item of detected) console.log(`    - ${item}`)
  console.log('  read functions that failed:')
  for (const item of failed) console.log(`    - ${item}`)
}

console.log('XyloNet stable pool diagnostic')
console.log(`chain id: ${await client.getChainId()}`)
console.log(`latest block: ${await client.getBlockNumber()}`)
console.log(`rpc url: ${rpcUrl}`)
console.log(`router address: ${router}`)
console.log('')
console.log('Tokens')

const uniqueTokens = new Map<string, KnownToken>()
for (const pool of pools) {
  for (const token of pool.tokens) uniqueTokens.set(token.address.toLowerCase(), token)
}

for (const token of uniqueTokens.values()) {
  await readToken(token)
}

for (const pool of pools) {
  await inspectPool(pool)
}
