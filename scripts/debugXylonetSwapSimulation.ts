/**
 * Debug XyloNet swap simulation with the same account-aware shape as the UI.
 *
 * Usage:
 *   npx tsx scripts/debugXylonetSwapSimulation.ts [account] [amountIn] [direction]
 *
 * Examples:
 *   npx tsx scripts/debugXylonetSwapSimulation.ts 0xYourWallet 1000000 usdc-to-eurc
 *   XYLONET_SIM_ACCOUNT=0xYourWallet npx tsx scripts/debugXylonetSwapSimulation.ts
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPublicClient, defineChain, http, isAddress, type Address } from 'viem'

const ARC_TESTNET_CHAIN_ID = 5_042_002
const ROUTER: Address = '0x73742278c31a76dBb0D2587d03ef92E6E2141023'
const POOL: Address = '0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1'
const USDC: Address = '0x3600000000000000000000000000000000000000'
const EURC: Address = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const DEFAULT_ACCOUNT: Address = '0x0000000000000000000000000000000000000001'

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
    name: 'swap',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'pool', type: 'address' },
      { name: 'tokenIn', type: 'address' },
      { name: 'tokenOut', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
      { name: 'minAmountOut', type: 'uint256' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
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
  console.log('  message:', error instanceof Error ? error.message : String(error))
}

loadEnvLocal()

const rpcUrl = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network'
const account = asAddress('account', process.argv[2] || process.env.XYLONET_SIM_ACCOUNT || DEFAULT_ACCOUNT)
const amountIn = process.argv[3] ? BigInt(process.argv[3]) : 1_000_000n
const direction = process.argv[4] || 'usdc-to-eurc'
const slippageBps = BigInt(process.env.XYLONET_SIM_SLIPPAGE_BPS || '50')
const safeDeadlineMinutes = Number(process.env.XYLONET_SIM_DEADLINE_MINUTES || '20')

const tokenIn = direction === 'eurc-to-usdc' ? EURC : USDC
const tokenOut = direction === 'eurc-to-usdc' ? USDC : EURC
const tokenInSymbol = direction === 'eurc-to-usdc' ? 'EURC' : 'USDC'
const tokenOutSymbol = direction === 'eurc-to-usdc' ? 'USDC' : 'EURC'

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

console.log('XyloNet swap simulation debug')
console.log('chainId:', ARC_TESTNET_CHAIN_ID)
console.log('rpcUrl:', rpcUrl)
console.log('account:', account)
console.log('direction:', `${tokenInSymbol} -> ${tokenOutSymbol}`)
console.log('amountIn:', amountIn.toString(), `(${Number(amountIn) / 1e6} ${tokenInSymbol}, 6 decimals)`)
console.log('')

const latestBlock = await client.getBlock({ blockTag: 'latest' })
const latestBlockTimestamp = latestBlock.timestamp
const deadline = latestBlockTimestamp + BigInt(Math.ceil(safeDeadlineMinutes * 60))

console.log('latest block:')
console.log('  number:', latestBlock.number?.toString() ?? '(pending)')
console.log('  timestamp:', latestBlockTimestamp.toString())
console.log('  deadline:', deadline.toString())
console.log('')

const allowance = await client.readContract({
  address: tokenIn,
  abi: ERC20_ABI,
  functionName: 'allowance',
  args: [account, ROUTER],
})

const balance = await client.readContract({
  address: tokenIn,
  abi: ERC20_ABI,
  functionName: 'balanceOf',
  args: [account],
})

console.log('account checks:')
console.log('  allowance owner:', account)
console.log('  allowance spender:', ROUTER)
console.log('  allowance:', allowance.toString())
console.log('  required allowance:', amountIn.toString())
console.log('  allowance sufficient:', allowance >= amountIn)
console.log('  balance:', balance.toString())
console.log('  balance sufficient:', balance >= amountIn)
console.log('')

const amountOut = await client.readContract({
  address: ROUTER,
  abi: XYLONET_ROUTER_ABI,
  functionName: 'getAmountOut',
  args: [tokenIn, tokenOut, amountIn],
})

const minAmountOut = amountOut - (amountOut * slippageBps) / 10_000n
const swapArgs = [POOL, tokenIn, tokenOut, amountIn, minAmountOut, account, deadline] as const

console.log('quote and swap args:')
console.log('  amountOut:', amountOut.toString(), `(${Number(amountOut) / 1e6} ${tokenOutSymbol})`)
console.log('  minAmountOut:', minAmountOut.toString(), `(${slippageBps.toString()} bps slippage)`)
console.log('  pool:', POOL)
console.log('  tokenIn:', tokenIn)
console.log('  tokenOut:', tokenOut)
console.log('  to:', account)
console.log('')

try {
  const result = await client.simulateContract({
    address: ROUTER,
    abi: XYLONET_ROUTER_ABI,
    functionName: 'swap',
    args: swapArgs,
    account,
    chain: arcTestnet,
  })

  console.log('simulation passed')
  console.log('  result:', result.result?.toString())
} catch (error: unknown) {
  console.log('simulation failed')
  printErrorFields(error)
  process.exitCode = 1
}
