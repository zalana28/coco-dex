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
const DEFAULT_SLIPPAGE_BPS = 50n

const UNITFLOW_V25_SWAP_ROUTER = '0x4AA8c7Ac458479d9A4FA5c1481e03061ac76824A'
const UNITFLOW_WUSDC = '0x911b4000D3422F482F4062a913885f7b035382Df'
const UNITFLOW_UNIVERSAL_ROUTER = '0xC43cC6A1E0F6EB48Cd4131522C1C73B13f3Da0F1'
const UNITFLOW_PERMIT2 = '0x4ce562F687d0Ced27b79Ba51d79B63BD978F7F48'
const USDC = '0x3600000000000000000000000000000000000000'
const EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'

const ERC20_ABI = [
  {
    type: 'function',
    name: 'balanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
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
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const satisfies Abi

const UNITFLOW_V25_ROUTER_ABI = [
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
  {
    type: 'function',
    name: 'swapExactTokensForTokensSupportingFeeOnTransferTokens',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'amountIn', type: 'uint256' },
      { name: 'amountOutMin', type: 'uint256' },
      { name: 'path', type: 'address[]' },
      { name: 'to', type: 'address' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const satisfies Abi

type TokenInfo = {
  label: string
  address: Address
  decimals: number
}

type PathCase = {
  label: string
  amountIn: bigint
  path: readonly Address[]
  outputDecimals: number
}

type SimulationFunction =
  | 'swapExactTokensForTokens'
  | 'swapExactTokensForTokensSupportingFeeOnTransferTokens'

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

function asAddress(label: string, value: string | undefined): Address {
  if (!value || !isAddress(value)) {
    throw new Error(`${label} is not a valid address: ${value ?? '(missing)'}`)
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
  console.log('    success: false')
  console.log('    name:', getField(error, 'name') ?? '(none)')
  console.log('    shortMessage:', getField(error, 'shortMessage') ?? '(none)')
  console.log('    details:', getField(error, 'details') ?? '(none)')
  console.log('    metaMessages:', getField(error, 'metaMessages') ?? '(none)')
  console.log('    cause.reason:', findNestedField(error, 'reason') ?? '(none)')
  console.log('    raw data:', findNestedField(error, 'data') ?? getField(error, 'data') ?? '(none)')
}

function calculateMinOut(amountOut: bigint): bigint {
  return amountOut - (amountOut * DEFAULT_SLIPPAGE_BPS) / 10_000n
}

function uniqueMinOuts(quotedAmountOut: bigint): Array<{ label: string; value: bigint }> {
  const variants = [
    { label: 'active slippage minOut', value: calculateMinOut(quotedAmountOut) },
    { label: 'minOut = 1', value: 1n },
    { label: 'minOut = 0', value: 0n },
  ]

  const seen = new Set<string>()
  return variants.filter((variant) => {
    const key = variant.value.toString()
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

loadEnvLocal()

const rpcUrl = process.env.ARC_TESTNET_RPC_URL || DEFAULT_ARC_RPC_URL
const account = asAddress('UNITFLOW_SIM_ACCOUNT', process.env.UNITFLOW_SIM_ACCOUNT)
const v25SwapRouter = asAddress('UNITFLOW_V25_SWAP_ROUTER', UNITFLOW_V25_SWAP_ROUTER)
const wusdc = asAddress('UNITFLOW_WUSDC', UNITFLOW_WUSDC)
const universalRouter = asAddress('UNITFLOW_UNIVERSAL_ROUTER', UNITFLOW_UNIVERSAL_ROUTER)
const permit2 = asAddress('UNITFLOW_PERMIT2', UNITFLOW_PERMIT2)
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

const tokenInfos: TokenInfo[] = [
  { label: 'USDC', address: usdc, decimals: 6 },
  { label: 'WUSDC', address: wusdc, decimals: 18 },
  { label: 'EURC', address: eurc, decimals: 6 },
]

const latestBlock = await client.getBlock({ blockTag: 'latest' })
const deadline = latestBlock.timestamp + 20n * 60n

const pathCases: PathCase[] = [
  {
    label: 'USDC -> WUSDC -> EURC',
    amountIn: 1_000_000n,
    path: [usdc, wusdc, eurc],
    outputDecimals: 6,
  },
  {
    label: 'EURC -> WUSDC',
    amountIn: 1_000_000n,
    path: [eurc, wusdc],
    outputDecimals: 18,
  },
  {
    label: 'EURC -> WUSDC -> USDC',
    amountIn: 1_000_000n,
    path: [eurc, wusdc, usdc],
    outputDecimals: 6,
  },
]

console.log('UnitFlow V2.5 execution diagnostic')
console.log('chainId:', ARC_TESTNET_CHAIN_ID)
console.log('rpcUrl:', rpcUrl)
console.log('account:', account)
console.log('v2.5 swap router:', v25SwapRouter)
console.log('UniversalRouter:', universalRouter)
console.log('Permit2:', permit2)
console.log('latest block:', latestBlock.number?.toString() ?? '(unknown)')
console.log('latest timestamp:', latestBlock.timestamp.toString())
console.log('deadline:', deadline.toString())
console.log('')

console.log('Token balance and allowance checks')
for (const token of tokenInfos) {
  let decimals = token.decimals
  try {
    decimals = await client.readContract({
      address: token.address,
      abi: ERC20_ABI,
      functionName: 'decimals',
    })
  } catch (error) {
    console.log(`${token.label} decimals read failed; using expected ${token.decimals}`)
    printSafeError(error)
  }

  const [balance, routerAllowance, permit2Allowance] = await Promise.all([
    client.readContract({
      address: token.address,
      abi: ERC20_ABI,
      functionName: 'balanceOf',
      args: [account],
    }),
    client.readContract({
      address: token.address,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account, v25SwapRouter],
    }),
    client.readContract({
      address: token.address,
      abi: ERC20_ABI,
      functionName: 'allowance',
      args: [account, permit2],
    }),
  ])

  console.log(`${token.label}: ${token.address}`)
  console.log('  decimals:', decimals)
  console.log('  balance:', balance.toString(), `(${formatUnits(balance, decimals)})`)
  console.log('  router allowance:', routerAllowance.toString(), `(${formatUnits(routerAllowance, decimals)})`)
  console.log('  Permit2 allowance:', permit2Allowance.toString(), `(${formatUnits(permit2Allowance, decimals)})`)
}
console.log('')

let anySimulationPassed = false
const functionVariants: SimulationFunction[] = [
  'swapExactTokensForTokens',
  'swapExactTokensForTokensSupportingFeeOnTransferTokens',
]

for (const pathCase of pathCases) {
  console.log(pathCase.label)
  console.log('  path:', pathCase.path)
  console.log('  amountIn:', pathCase.amountIn.toString())

  let quotedAmounts: readonly bigint[] | undefined
  try {
    quotedAmounts = await client.readContract({
      address: v25SwapRouter,
      abi: UNITFLOW_V25_ROUTER_ABI,
      functionName: 'getAmountsOut',
      args: [pathCase.amountIn, pathCase.path],
    })
    const quotedAmountOut = quotedAmounts[quotedAmounts.length - 1] ?? 0n
    console.log('  getAmountsOut success: true')
    console.log('  amounts:', quotedAmounts.map((amount) => amount.toString()))
    console.log('  quoted amountOut:', quotedAmountOut.toString(), `(${formatUnits(quotedAmountOut, pathCase.outputDecimals)})`)
  } catch (error) {
    console.log('  getAmountsOut failed')
    printSafeError(error)
    console.log('')
    continue
  }

  const quotedAmountOut = quotedAmounts[quotedAmounts.length - 1] ?? 0n
  for (const minOut of uniqueMinOuts(quotedAmountOut)) {
    for (const functionName of functionVariants) {
      const args = [
        pathCase.amountIn,
        minOut.value,
        pathCase.path,
        account,
        deadline,
      ] as const

      console.log(`  simulate ${functionName}`)
      console.log('    minOut variant:', minOut.label)
      console.log('    args:')
      console.dir(args, { depth: 8 })

      try {
        await client.simulateContract({
          address: v25SwapRouter,
          abi: UNITFLOW_V25_ROUTER_ABI,
          functionName,
          args,
          account,
          chain: arcTestnet,
        })
        anySimulationPassed = true
        console.log('    success: true')
      } catch (error) {
        printSafeError(error)
      }
    }
  }

  console.log('')
}

console.log('Summary')
console.log('  any V2.5 simulation passed:', anySimulationPassed)
console.log('  execution recommendation:', anySimulationPassed
  ? 'V2.5 execution may be enabled only for the passing path/function/minOut combination after UI integration review.'
  : 'Keep UnitFlow quote-only. V2.5 execution is not proven; UniversalRouter/Permit2 command encoding remains deferred.')
