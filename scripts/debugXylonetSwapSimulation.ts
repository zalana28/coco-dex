/**
 * Debug script: Simulate XyloNet swap with allowance check.
 *
 * Usage:
 *   npx tsx scripts/debugXylonetSwapSimulation.ts [amountIn] [direction]
 *
 * Examples:
 *   npx tsx scripts/debugXylonetSwapSimulation.ts 1000000 usdc-to-eurc
 *   npx tsx scripts/debugXylonetSwapSimulation.ts 1000000 eurc-to-usdc
 *
 * Default: 1 USDC (1000000) → EURC
 *
 * This script:
 * 1. Reads allowance for a test account to the XyloNet router
 * 2. Gets a quote via getAmountOut
 * 3. Simulates swap with the exact args the UI would use
 * 4. Reports success or detailed failure reason
 */

import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { createPublicClient, defineChain, http, type Address } from 'viem'

// ─── Constants ───
const ARC_TESTNET_CHAIN_ID = 5_042_002
const ROUTER: Address = '0x73742278c31a76dBb0D2587d03ef92E6E2141023'
const POOL: Address = '0x3DF3966F5138143dce7a9cFDdC2c0310ce083BB1'
const USDC: Address = '0x3600000000000000000000000000000000000000'
const EURC: Address = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'

// Default test account (zero address for simulation — will show allowance=0 scenario)
const TEST_ACCOUNT: Address = '0x0000000000000000000000000000000000000001'

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

// ─── Load .env.local ───
function loadEnvLocal() {
  const envPath = resolve(process.cwd(), '.env.local')
  if (!existsSync(envPath)) return
  const contents = readFileSync(envPath, 'utf8')
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const idx = trimmed.indexOf('=')
    if (idx === -1) continue
    const key = trimmed.slice(0, idx).trim()
    let value = trimmed.slice(idx + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] ??= value
  }
}

loadEnvLocal()

const rpcUrl = process.env.ARC_TESTNET_RPC_URL || 'https://rpc.testnet.arc.network'

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

// ─── Parse args ───
const amountInArg = process.argv[2] ? BigInt(process.argv[2]) : 1_000_000n // 1 USDC
const directionArg = process.argv[3] || 'usdc-to-eurc'

const tokenIn = directionArg === 'eurc-to-usdc' ? EURC : USDC
const tokenOut = directionArg === 'eurc-to-usdc' ? USDC : EURC
const tokenInSymbol = directionArg === 'eurc-to-usdc' ? 'EURC' : 'USDC'
const tokenOutSymbol = directionArg === 'eurc-to-usdc' ? 'USDC' : 'EURC'

console.log('═══════════════════════════════════════════')
console.log(' XyloNet Swap Simulation Debug')
console.log('═══════════════════════════════════════════')
console.log('')
console.log(`Direction:  ${tokenInSymbol} → ${tokenOutSymbol}`)
console.log(`Amount In:  ${amountInArg} (${Number(amountInArg) / 1e6} ${tokenInSymbol})`)
console.log(`Router:     ${ROUTER}`)
console.log(`Pool:       ${POOL}`)
console.log(`Token In:   ${tokenIn}`)
console.log(`Token Out:  ${tokenOut}`)
console.log(`RPC:        ${rpcUrl}`)
console.log(`Account:    ${TEST_ACCOUNT}`)
console.log('')

// ─── Step 1: Check allowance ───
console.log('─── Step 1: Check allowance ───')
try {
  const currentAllowance = await client.readContract({
    address: tokenIn,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [TEST_ACCOUNT, ROUTER],
  })
  console.log(`  Allowance to router: ${currentAllowance}`)
  console.log(`  Required:            ${amountInArg}`)
  console.log(`  Sufficient:          ${currentAllowance >= amountInArg}`)
  if (currentAllowance < amountInArg) {
    console.log('')
    console.log('  ⚠️  Allowance insufficient — simulation will likely fail.')
    console.log('      In the real app, button should show "Approve" first.')
  }
} catch (err: unknown) {
  console.log('  Allowance check failed:', (err as Error).message?.slice(0, 100))
}

// ─── Step 2: Get quote ───
console.log('')
console.log('─── Step 2: Get quote (getAmountOut) ───')
let amountOut: bigint = 0n
try {
  amountOut = await client.readContract({
    address: ROUTER,
    abi: XYLONET_ROUTER_ABI,
    functionName: 'getAmountOut',
    args: [tokenIn, tokenOut, amountInArg],
  })
  console.log(`  amountOut: ${amountOut} (${Number(amountOut) / 1e6} ${tokenOutSymbol})`)
} catch (err: unknown) {
  console.log('  getAmountOut FAILED:', (err as Error).message?.slice(0, 150))
  process.exit(1)
}

// ─── Step 3: Compute minAmountOut (0.5% slippage) ───
const slippageBps = 50n // 0.5%
const minAmountOut = amountOut - (amountOut * slippageBps) / 10_000n
const deadlineSeconds = BigInt(Math.floor(Date.now() / 1000) + 20 * 60) // 20 min from now

console.log('')
console.log('─── Step 3: Swap parameters ───')
console.log(`  amountIn:     ${amountInArg}`)
console.log(`  amountOut:    ${amountOut}`)
console.log(`  minAmountOut: ${minAmountOut} (0.5% slippage)`)
console.log(`  deadline:     ${deadlineSeconds} (${new Date(Number(deadlineSeconds) * 1000).toISOString()})`)
console.log(`  recipient:    ${TEST_ACCOUNT}`)

// ─── Step 4: Simulate swap ───
console.log('')
console.log('─── Step 4: Simulate swap ───')
try {
  const result = await client.simulateContract({
    address: ROUTER,
    abi: XYLONET_ROUTER_ABI,
    functionName: 'swap',
    args: [POOL, tokenIn, tokenOut, amountInArg, minAmountOut, TEST_ACCOUNT, deadlineSeconds],
    account: TEST_ACCOUNT,
  })
  console.log('  ✅ Simulation PASSED')
  console.log(`  Result: ${result.result}`)
} catch (simErr: unknown) {
  console.log('  ❌ Simulation FAILED')
  const errObj = simErr as Record<string, unknown>
  console.log('')
  console.log('  Error details:')
  console.log('    name:', errObj?.name ?? '(none)')
  console.log('    shortMessage:', errObj?.shortMessage ?? '(none)')
  console.log('    details:', errObj?.details ?? '(none)')

  const message = String(errObj?.message ?? '')
  if (message.length > 300) {
    console.log('    message (truncated):', message.slice(0, 300) + '…')
  } else {
    console.log('    message:', message || '(none)')
  }

  // Try to identify the cause
  console.log('')
  console.log('  Likely cause:')
  if (message.includes('allowance') || message.includes('ERC20')) {
    console.log('    → Insufficient token allowance to XyloNet router.')
    console.log('    → The user must approve the router before swap can execute.')
  } else if (message.includes('balance')) {
    console.log('    → Insufficient token balance.')
  } else if (message.includes('EXPIRED') || message.includes('deadline')) {
    console.log('    → Deadline expired.')
  } else if (message.includes('execution reverted')) {
    console.log('    → Generic revert. If allowance/balance are sufficient,')
    console.log('      this may be a pool state issue or wrong function signature.')
  } else {
    console.log('    → Unknown cause. Check error details above.')
  }
}

console.log('')
console.log('═══════════════════════════════════════════')
console.log(' Done')
console.log('═══════════════════════════════════════════')
