import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createPublicClient,
  defineChain,
  formatUnits,
  http,
  isAddress,
  parseUnits,
  type Abi,
  type Address,
} from 'viem'

const ARC_TESTNET_CHAIN_ID = 5_042_002
const DEFAULT_ARC_RPC_URL = 'https://rpc.testnet.arc.network'

const COCO_STABLE_POOL = '0x0EA7A79F8864091ac7F2B8643BaA7598a9d05a83'
const COCO_STABLE_LP = '0xfE4A959c689019E09f584F25114Bb5A5e2aA8499'
const USDC = '0x3600000000000000000000000000000000000000'
const EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'

const TOKEN_DECIMALS = 6
const MIN_LIQUIDITY_FOR_TEN_TOKEN_QUOTE = 10_000_000n

const COCO_STABLE_POOL_ABI = [
  {
    type: 'function',
    name: 'getTokens',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: '', type: 'address' },
      { name: '', type: 'address' },
    ],
  },
  {
    type: 'function',
    name: 'getBalances',
    stateMutability: 'view',
    inputs: [],
    outputs: [
      { name: 'balance0', type: 'uint256' },
      { name: 'balance1', type: 'uint256' },
    ],
  },
  {
    type: 'function',
    name: 'lpToken',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'address' }],
  },
  {
    type: 'function',
    name: 'feeBps',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'amplificationParameter',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
  {
    type: 'function',
    name: 'paused',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'bool' }],
  },
  {
    type: 'function',
    name: 'getAmountOut',
    stateMutability: 'view',
    inputs: [
      { name: 'tokenIn', type: 'address' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const satisfies Abi

const COCO_STABLE_LP_ABI = [
  {
    type: 'function',
    name: 'totalSupply',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const satisfies Abi

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

type QuoteDirection = {
  label: string
  tokenIn: Address
  reserveIn: bigint
  reserveOut: bigint
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

function formatAmount(amount: bigint) {
  return `${amount} raw (${formatUnits(amount, TOKEN_DECIMALS)})`
}

function getErrorField(error: unknown, field: string): unknown {
  if (!error || typeof error !== 'object') return undefined
  return (error as Record<string, unknown>)[field]
}

function printReadError(error: unknown) {
  console.log('  success: false')
  console.log('  shortMessage:', getErrorField(error, 'shortMessage') ?? '(none)')
  console.log('  details:', getErrorField(error, 'details') ?? '(none)')
}

async function main() {
  loadEnvLocal()

  const rpcUrl = process.env.ARC_TESTNET_RPC_URL
  if (!rpcUrl) {
    throw new Error('ARC_TESTNET_RPC_URL is required in .env.local or the local shell environment')
  }

  const pool = asAddress('COCO_STABLE_POOL', COCO_STABLE_POOL)
  const expectedLpToken = asAddress('COCO_STABLE_LP', COCO_STABLE_LP)
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

  console.log('CocoStablePool quote diagnostic')
  console.log('chainId:', ARC_TESTNET_CHAIN_ID)
  console.log('pool:', pool)
  console.log('mode: read-only quote diagnostics; no approvals, swaps, or writes')
  console.log('')

  const [tokens, balances, lpToken, feeBps, amplificationParameter, paused] = await Promise.all([
    client.readContract({
      address: pool,
      abi: COCO_STABLE_POOL_ABI,
      functionName: 'getTokens',
    }),
    client.readContract({
      address: pool,
      abi: COCO_STABLE_POOL_ABI,
      functionName: 'getBalances',
    }),
    client.readContract({
      address: pool,
      abi: COCO_STABLE_POOL_ABI,
      functionName: 'lpToken',
    }),
    client.readContract({
      address: pool,
      abi: COCO_STABLE_POOL_ABI,
      functionName: 'feeBps',
    }),
    client.readContract({
      address: pool,
      abi: COCO_STABLE_POOL_ABI,
      functionName: 'amplificationParameter',
    }),
    client.readContract({
      address: pool,
      abi: COCO_STABLE_POOL_ABI,
      functionName: 'paused',
    }),
  ])

  const [token0, token1] = tokens
  const [balance0, balance1] = balances

  const totalLpSupply = await client.readContract({
    address: expectedLpToken,
    abi: COCO_STABLE_LP_ABI,
    functionName: 'totalSupply',
  })

  console.log('Pool state')
  console.log('  token0:', token0)
  console.log('  token1:', token1)
  console.log('  expected USDC:', usdc)
  console.log('  expected EURC:', eurc)
  console.log('  lpToken:', lpToken)
  console.log('  expected LP token:', expectedLpToken)
  console.log('  balance0:', formatAmount(balance0))
  console.log('  balance1:', formatAmount(balance1))
  console.log('  totalLpSupply:', formatAmount(totalLpSupply))
  console.log('  feeBps:', feeBps.toString())
  console.log('  amplificationParameter:', amplificationParameter.toString())
  console.log('  paused:', paused)

  const minReserve = balance0 < balance1 ? balance0 : balance1
  if (minReserve < MIN_LIQUIDITY_FOR_TEN_TOKEN_QUOTE) {
    console.log('  warning: pool liquidity is tiny; router execution should remain disabled')
  }
  if (lpToken.toLowerCase() !== expectedLpToken.toLowerCase()) {
    console.log('  warning: pool lpToken does not match the expected deployed LP token')
  }
  if (token0.toLowerCase() !== usdc.toLowerCase() || token1.toLowerCase() !== eurc.toLowerCase()) {
    console.log('  warning: pool tokens do not match the expected USDC/EURC deployment')
  }

  console.log('')
  console.log('Quote checks')

  const inputLabels = ['0.01', '0.1', '1']
  if (minReserve >= MIN_LIQUIDITY_FOR_TEN_TOKEN_QUOTE) {
    inputLabels.push('10')
  } else {
    console.log('Skipping 10-token quote because pool liquidity is below 10 tokens on at least one side.')
  }

  const directions: QuoteDirection[] = [
    { label: 'USDC -> EURC', tokenIn: usdc, reserveIn: balance0, reserveOut: balance1 },
    { label: 'EURC -> USDC', tokenIn: eurc, reserveIn: balance1, reserveOut: balance0 },
  ]

  for (const direction of directions) {
    console.log('')
    console.log(direction.label)

    for (const inputLabel of inputLabels) {
      const amountIn = parseUnits(inputLabel, TOKEN_DECIMALS)
      console.log(`  input ${inputLabel}: ${formatAmount(amountIn)}`)

      try {
        const amountOut = await client.readContract({
          address: pool,
          abi: COCO_STABLE_POOL_ABI,
          functionName: 'getAmountOut',
          args: [direction.tokenIn, amountIn],
        })

        console.log('    amountOut:', formatAmount(amountOut))
        if (amountOut === 0n) {
          console.log('    warning: quote output is zero')
        }
        if (amountOut >= direction.reserveOut && direction.reserveOut > 0n) {
          console.log('    warning: quote output is greater than or equal to current output-side reserve')
        }
        if (amountIn > direction.reserveIn / 2n) {
          console.log('    warning: input is large relative to current input-side liquidity')
        }
      } catch (error) {
        printReadError(error)
      }
    }
  }

  console.log('')
  console.log('Result: quote diagnostics completed without broadcasting any transaction.')
}

main().catch((error: unknown) => {
  console.error('CocoStablePool quote diagnostic failed')
  console.error(getErrorField(error, 'message') ?? error)
  process.exitCode = 1
})
