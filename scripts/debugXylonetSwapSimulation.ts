/**
 * Debug XyloNet swap simulation with account-aware variants.
 *
 * Usage:
 *   npx tsx scripts/debugXylonetSwapSimulation.ts [account] [amount]
 *
 * Env:
 *   XYLONET_SIM_ACCOUNT=0x...
 *   XYLONET_SIM_DIRECTION=USDC_TO_EURC | EURC_TO_USDC
 *   XYLONET_SIM_MIN_OUT=auto | quote_minus_1 | one | zero
 *   XYLONET_SIM_AMOUNT=1
 *   XYLONET_SIM_AMOUNT_RAW=1000000
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPublicClient, defineChain, http, isAddress, toFunctionSelector, type Address } from 'viem'

const ARC_TESTNET_CHAIN_ID = 5_042_002
const ROUTER: Address = '0x73742278c31a76dBb0D2587d03ef92E6E2141023'
const POOL: Address = '0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1'
const USDC: Address = '0x3600000000000000000000000000000000000000'
const EURC: Address = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const DEFAULT_ACCOUNT: Address = '0x0000000000000000000000000000000000000001'
const TOKEN_DECIMALS = 6n
const DEFAULT_SLIPPAGE_BPS = 50n

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
  {
    type: 'function',
    name: 'swapExactTokensForTokens',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: 'amounts', type: 'uint256[]' }],
  },
] as const

const ERC20_ABI = [
  {
    type: 'function',
    name: 'allowance',
    stateMutability: 'view',
    inputs: [
      { name: 'owner', type: 'address' },
      { name: 'spender', type: 'address' },
    ],
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

type Direction = 'USDC_TO_EURC' | 'EURC_TO_USDC'
type MinOutMode = 'auto' | 'quote_minus_1' | 'one' | 'zero'

type SimulationVariant = {
  direction: Direction
  minOutMode: MinOutMode
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

function asAddress(label: string, value: string | undefined): Address {
  if (!value || !isAddress(value)) {
    throw new Error(`${label} is not a valid address: ${value ?? '(missing)'}`)
  }
  return value
}

function getErrorField(error: unknown, field: string): unknown {
  if (!error || typeof error !== 'object') return undefined
  return (error as Record<string, unknown>)[field]
}

function getNestedRevertReason(error: unknown): unknown {
  const walk = getErrorField(error, 'walk')
  if (typeof walk !== 'function') return getErrorField(error, 'reason')

  const reasonError = walk.call(error, (value: unknown) => Boolean(getErrorField(value, 'reason')))
  return getErrorField(reasonError, 'reason')
}

function printErrorFields(error: unknown) {
  const cause = getErrorField(error, 'cause')
  console.log('  name:', getErrorField(error, 'name') ?? '(none)')
  console.log('  shortMessage:', getErrorField(error, 'shortMessage') ?? '(none)')
  console.log('  details:', getErrorField(error, 'details') ?? '(none)')
  console.log('  metaMessages:', getErrorField(error, 'metaMessages') ?? '(none)')
  console.log('  cause.shortMessage:', getErrorField(cause, 'shortMessage') ?? '(none)')
  console.log('  cause.reason:', getNestedRevertReason(error) ?? getErrorField(cause, 'reason') ?? '(none)')
  console.log('  raw error data:', getErrorField(error, 'data') ?? getErrorField(cause, 'data') ?? '(none)')
  console.log('  cause:')
  console.dir(cause ?? '(none)', { depth: 8 })
  console.log('  message:', error instanceof Error ? error.message : String(error))
}

function normalizeDirection(value: string | undefined): Direction | undefined {
  if (!value) return undefined
  const normalized = value.trim().toUpperCase().replaceAll('-', '_')
  if (normalized === 'USDC_TO_EURC') return 'USDC_TO_EURC'
  if (normalized === 'EURC_TO_USDC') return 'EURC_TO_USDC'
  throw new Error(`Invalid XYLONET_SIM_DIRECTION: ${value}`)
}

function normalizeMinOutMode(value: string | undefined): MinOutMode | undefined {
  if (!value) return undefined
  const normalized = value.trim().toLowerCase().replaceAll('-', '_')
  if (normalized === 'auto' || normalized === 'quote_minus_1' || normalized === 'one' || normalized === 'zero') return normalized
  throw new Error(`Invalid XYLONET_SIM_MIN_OUT: ${value}`)
}

function parseAmountRaw(cliValue: string | undefined): bigint {
  if (process.env.XYLONET_SIM_AMOUNT_RAW) return BigInt(process.env.XYLONET_SIM_AMOUNT_RAW)
  const decimalAmount = cliValue ?? process.env.XYLONET_SIM_AMOUNT ?? '1'
  const [whole, fraction = ''] = decimalAmount.split('.')
  const paddedFraction = `${fraction}000000`.slice(0, Number(TOKEN_DECIMALS))
  return BigInt(whole || '0') * 10n ** TOKEN_DECIMALS + BigInt(paddedFraction)
}

function getDirectionTokens(direction: Direction) {
  if (direction === 'EURC_TO_USDC') {
    return { tokenIn: EURC, tokenOut: USDC, tokenInSymbol: 'EURC', tokenOutSymbol: 'USDC' }
  }
  return { tokenIn: USDC, tokenOut: EURC, tokenInSymbol: 'USDC', tokenOutSymbol: 'EURC' }
}

function getMinAmountOut(mode: MinOutMode, amountOut: bigint) {
  if (mode === 'quote_minus_1') return amountOut > 0n ? amountOut - 1n : 0n
  if (mode === 'one') return 1n
  if (mode === 'zero') return 0n
  return amountOut - (amountOut * DEFAULT_SLIPPAGE_BPS) / 10_000n
}

loadEnvLocal()

const rpcUrl = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network'
const account = asAddress('account', process.argv[2] || process.env.XYLONET_SIM_ACCOUNT || DEFAULT_ACCOUNT)
const amountIn = parseAmountRaw(process.argv[3])
const selectedDirection = normalizeDirection(process.env.XYLONET_SIM_DIRECTION)
const selectedMinOutMode = normalizeMinOutMode(process.env.XYLONET_SIM_MIN_OUT)

const arcTestnet = defineChain({
  id: ARC_TESTNET_CHAIN_ID,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USD Coin', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [rpcUrl] } },
  testnet: true,
})

const client = createPublicClient({
  chain: arcTestnet,
  transport: http(rpcUrl),
})

const directions: Direction[] = selectedDirection ? [selectedDirection] : ['USDC_TO_EURC', 'EURC_TO_USDC']
const minOutModes: MinOutMode[] = selectedMinOutMode ? [selectedMinOutMode] : ['auto', 'quote_minus_1', 'one', 'zero']
const variants: SimulationVariant[] = directions.flatMap((direction) =>
  minOutModes.map((minOutMode) => ({ direction, minOutMode }))
)

const latestBlock = await client.getBlock({ blockTag: 'latest' })
const latestBlockTimestamp = latestBlock.timestamp
const deadline = latestBlockTimestamp + 20n * 60n

console.log('XyloNet swap simulation debug')
console.log('chainId:', ARC_TESTNET_CHAIN_ID)
console.log('rpcUrl:', rpcUrl)
console.log('account:', account)
console.log('amountIn:', amountIn.toString(), `(${Number(amountIn) / 1e6}, 6 decimals)`)
console.log('router:', ROUTER)
console.log('pool:', POOL)
console.log('docs swap selector:', toFunctionSelector('swap(address,address,address,uint256,uint256,address,uint256)'))
console.log('deployed swap selector:', toFunctionSelector('swapExactTokensForTokens(uint256,uint256,address[],address,uint256)'))
console.log('latest block:', latestBlock.number?.toString() ?? '(pending)')
console.log('latest block timestamp:', latestBlockTimestamp.toString())
console.log('deadline:', deadline.toString())
console.log('')

for (const variant of variants) {
  const { tokenIn, tokenOut, tokenInSymbol, tokenOutSymbol } = getDirectionTokens(variant.direction)
  const label = `${variant.direction} / minOut=${variant.minOutMode}`

  console.log('='.repeat(80))
  console.log(label)
  console.log('tokenIn:', tokenIn)
  console.log('tokenOut:', tokenOut)
  console.log('amountIn:', amountIn.toString())

  const [allowance, balance, amountOut] = await Promise.all([
    client.readContract({
      address: tokenIn,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account, ROUTER],
    }),
    client.readContract({
      address: tokenIn,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account],
    }),
    client.readContract({
      address: ROUTER,
      abi: XYLONET_ROUTER_ABI,
      functionName: 'getAmountOut',
      args: [tokenIn, tokenOut, amountIn],
    }),
  ])

  const minAmountOut = getMinAmountOut(variant.minOutMode, amountOut)
  const path = [tokenIn, tokenOut] as const

  console.log('quoted amountOut:', amountOut.toString(), `(${Number(amountOut) / 1e6} ${tokenOutSymbol})`)
  console.log('minAmountOut:', minAmountOut.toString())
  console.log('allowance:', allowance.toString(), `sufficient=${allowance >= amountIn}`)
  console.log('balance:', balance.toString(), `sufficient=${balance >= amountIn}`)
  console.log('deadline:', deadline.toString())
  console.log('token symbols:', `${tokenInSymbol} -> ${tokenOutSymbol}`)

  try {
    const result = await client.simulateContract({
      address: ROUTER,
      abi: XYLONET_ROUTER_ABI,
      functionName: 'swapExactTokensForTokens',
      args: [amountIn, minAmountOut, path, account, deadline],
      account,
      chain: arcTestnet,
    })

    console.log('simulation result: success')
    console.log('result:', result.result.map((value) => value.toString()))
  } catch (error: unknown) {
    console.log('simulation result: fail')
    printErrorFields(error)
  }

  console.log('')
}
