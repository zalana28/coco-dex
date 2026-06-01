import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createPublicClient,
  defineChain,
  encodeAbiParameters,
  formatUnits,
  http,
  isAddress,
  parseAbiParameters,
  type Abi,
  type Address,
  type Hex,
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

const V2_SWAP_EXACT_IN = '08'
const V2_SWAP_EXACT_OUT = '09'
const WRAP_ETH = '0b'
const UNWRAP_WETH = '0c'
const SWEEP = '04'
const PERMIT2_PERMIT = '0a'

const UNIVERSAL_ROUTER_ABI = [
  {
    type: 'function',
    name: 'execute',
    stateMutability: 'payable',
    inputs: [
      { name: 'commands', type: 'bytes' },
      { name: 'inputs', type: 'bytes[]' },
      { name: 'deadline', type: 'uint256' },
    ],
    outputs: [],
  },
] as const satisfies Abi

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

type TokenInfo = {
  label: 'USDC' | 'WUSDC' | 'EURC'
  address: Address
  expectedDecimals: number
}

type MinOutVariant = {
  label: string
  value: bigint
}

type SimulationAttempt = {
  label: string
  commands: Hex
  decodedPlan: readonly string[]
  value: bigint
  amountIn: bigint
  amountOutQuoted?: bigint
  minOut: MinOutVariant
  path: readonly Address[]
  outputDecimals: number
  inputs: readonly Hex[]
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
  console.log('  success: false')
  console.log('  name:', getField(error, 'name') ?? '(none)')
  console.log('  shortMessage:', getField(error, 'shortMessage') ?? '(none)')
  console.log('  details:', getField(error, 'details') ?? '(none)')
  console.log('  metaMessages:', getField(error, 'metaMessages') ?? '(none)')
  console.log('  cause.reason:', findNestedField(error, 'reason') ?? '(none)')
  console.log('  raw data:', findNestedField(error, 'data') ?? getField(error, 'data') ?? '(none)')
}

function calculateMinOut(amountOut: bigint): bigint {
  return amountOut - (amountOut * DEFAULT_SLIPPAGE_BPS) / 10_000n
}

function uniqueMinOuts(amountOut: bigint): MinOutVariant[] {
  const variants = [
    { label: 'normal 50 bps', value: calculateMinOut(amountOut) },
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

function encodeWrapInput(recipient: Address, amountMin: bigint): Hex {
  return encodeAbiParameters(parseAbiParameters('address recipient, uint256 amountMin'), [recipient, amountMin])
}

function encodeV2SwapExactInInput(
  recipient: Address,
  amountIn: bigint,
  amountOutMin: bigint,
  path: readonly Address[],
  payerIsUser: boolean,
): Hex {
  return encodeAbiParameters(
    parseAbiParameters('address recipient, uint256 amountIn, uint256 amountOutMin, address[] path, bool payerIsUser'),
    [recipient, amountIn, amountOutMin, [...path], payerIsUser],
  )
}

function encodeSweepInput(token: Address, recipient: Address, amountMin: bigint): Hex {
  return encodeAbiParameters(parseAbiParameters('address token, address recipient, uint256 amountMin'), [token, recipient, amountMin])
}

function encodeUnwrapInput(recipient: Address, amountMin: bigint): Hex {
  return encodeAbiParameters(parseAbiParameters('address recipient, uint256 amountMin'), [recipient, amountMin])
}

function commands(...commands: string[]): Hex {
  return `0x${commands.join('')}`
}

function usage() {
  console.log('Usage:')
  console.log('  UNITFLOW_UR_ACCOUNT=0xYourWallet npm run debug:unitflow-ur')
}

loadEnvLocal()

if (!process.env.UNITFLOW_UR_ACCOUNT) {
  usage()
  process.exit(1)
}

const rpcUrl = process.env.ARC_TESTNET_RPC_URL || DEFAULT_ARC_RPC_URL
const account = asAddress('UNITFLOW_UR_ACCOUNT', process.env.UNITFLOW_UR_ACCOUNT)
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

const tokens: TokenInfo[] = [
  { label: 'USDC', address: usdc, expectedDecimals: 6 },
  { label: 'WUSDC', address: wusdc, expectedDecimals: 18 },
  { label: 'EURC', address: eurc, expectedDecimals: 6 },
]

const latestBlock = await client.getBlock({ blockTag: 'latest' })
const deadline = latestBlock.timestamp + 20n * 60n
const nativeBalance = await client.getBalance({ address: account })

const tokenDecimals = new Map<Address, number>()

console.log('UnitFlow UniversalRouter diagnostic')
console.log('chainId:', ARC_TESTNET_CHAIN_ID)
console.log('rpcUrl:', rpcUrl)
console.log('account:', account)
console.log('UniversalRouter:', universalRouter)
console.log('Permit2:', permit2)
console.log('V2.5 Swap Router:', v25SwapRouter)
console.log('latest block:', latestBlock.number?.toString() ?? '(unknown)')
console.log('latest timestamp:', latestBlock.timestamp.toString())
console.log('deadline:', deadline.toString())
console.log('native balance:', nativeBalance.toString(), `(${formatUnits(nativeBalance, 18)} native USDC)`)
console.log('command bytes:')
console.log('  V2_SWAP_EXACT_IN:', `0x${V2_SWAP_EXACT_IN}`)
console.log('  V2_SWAP_EXACT_OUT:', `0x${V2_SWAP_EXACT_OUT}`)
console.log('  WRAP_ETH:', `0x${WRAP_ETH}`)
console.log('  UNWRAP_WETH:', `0x${UNWRAP_WETH}`)
console.log('  SWEEP:', `0x${SWEEP}`)
console.log('  PERMIT2_PERMIT:', `0x${PERMIT2_PERMIT}`)
console.log('')

console.log('Token balances, decimals, and allowances')
for (const token of tokens) {
  let decimals = token.expectedDecimals
  try {
    decimals = await client.readContract({
      address: token.address,
      abi: ERC20_ABI,
      functionName: 'decimals',
    })
  } catch (error) {
    console.log(`${token.label} decimals read failed; using expected ${token.expectedDecimals}`)
    printSafeError(error)
  }
  tokenDecimals.set(token.address, decimals)

  const [balance, universalRouterAllowance, permit2Allowance] = await Promise.all([
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
      args: [account, universalRouter],
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
  console.log('  UniversalRouter allowance:', universalRouterAllowance.toString(), `(${formatUnits(universalRouterAllowance, decimals)})`)
  console.log('  Permit2 allowance:', permit2Allowance.toString(), `(${formatUnits(permit2Allowance, decimals)})`)
}
console.log('')

const nativeAmountIn = 1_000_000_000_000_000_000n
const ercAmountIn = 1_000_000n
const wusdcToEurcPath = [wusdc, eurc] as const
const eurcToWusdcPath = [eurc, wusdc] as const

const wusdcToEurcQuote = await client.readContract({
  address: v25SwapRouter,
  abi: V2_ROUTER_ABI,
  functionName: 'getAmountsOut',
  args: [nativeAmountIn, wusdcToEurcPath],
})
const wusdcToEurcAmountOut = wusdcToEurcQuote[wusdcToEurcQuote.length - 1] ?? 0n

const eurcToWusdcQuote = await client.readContract({
  address: v25SwapRouter,
  abi: V2_ROUTER_ABI,
  functionName: 'getAmountsOut',
  args: [ercAmountIn, eurcToWusdcPath],
})
const eurcToWusdcAmountOut = eurcToWusdcQuote[eurcToWusdcQuote.length - 1] ?? 0n

console.log('Known V2.5 quote paths')
console.log('  WUSDC -> EURC amounts:', wusdcToEurcQuote.map((amount) => amount.toString()))
console.log('  WUSDC -> EURC formatted out:', formatUnits(wusdcToEurcAmountOut, tokenDecimals.get(eurc) ?? 6))
console.log('  EURC -> WUSDC amounts:', eurcToWusdcQuote.map((amount) => amount.toString()))
console.log('  EURC -> WUSDC formatted out:', formatUnits(eurcToWusdcAmountOut, tokenDecimals.get(wusdc) ?? 18))
console.log('')

const attempts: SimulationAttempt[] = []

for (const minOut of uniqueMinOuts(wusdcToEurcAmountOut)) {
  for (const wrapRecipient of [universalRouter, account] as const) {
    for (const swapRecipient of [universalRouter, account] as const) {
      for (const payerIsUser of [false, true]) {
        attempts.push({
          label: `Variant A native USDC -> WRAP_ETH -> V2 WUSDC/EURC -> SWEEP, wrapRecipient=${wrapRecipient === universalRouter ? 'UniversalRouter' : 'account'}, swapRecipient=${swapRecipient === universalRouter ? 'UniversalRouter' : 'account'}, payerIsUser=${payerIsUser}`,
          commands: commands(WRAP_ETH, V2_SWAP_EXACT_IN, SWEEP),
          decodedPlan: [
            `WRAP_ETH(recipient=${wrapRecipient}, amountMin=${nativeAmountIn})`,
            `V2_SWAP_EXACT_IN(recipient=${swapRecipient}, amountIn=${nativeAmountIn}, amountOutMin=${minOut.value}, path=[WUSDC, EURC], payerIsUser=${payerIsUser})`,
            `SWEEP(token=EURC, recipient=${account}, amountMin=${minOut.value})`,
          ],
          value: nativeAmountIn,
          amountIn: nativeAmountIn,
          amountOutQuoted: wusdcToEurcAmountOut,
          minOut,
          path: wusdcToEurcPath,
          outputDecimals: tokenDecimals.get(eurc) ?? 6,
          inputs: [
            encodeWrapInput(wrapRecipient, nativeAmountIn),
            encodeV2SwapExactInInput(swapRecipient, nativeAmountIn, minOut.value, wusdcToEurcPath, payerIsUser),
            encodeSweepInput(eurc, account, minOut.value),
          ],
        })
      }
    }
  }
}

for (const minOut of uniqueMinOuts(wusdcToEurcAmountOut)) {
  for (const payerIsUser of [true, false]) {
    attempts.push({
      label: `Variant B existing WUSDC -> EURC, payerIsUser=${payerIsUser}`,
      commands: commands(V2_SWAP_EXACT_IN),
      decodedPlan: [
        `V2_SWAP_EXACT_IN(recipient=${account}, amountIn=${nativeAmountIn}, amountOutMin=${minOut.value}, path=[WUSDC, EURC], payerIsUser=${payerIsUser})`,
      ],
      value: 0n,
      amountIn: nativeAmountIn,
      amountOutQuoted: wusdcToEurcAmountOut,
      minOut,
      path: wusdcToEurcPath,
      outputDecimals: tokenDecimals.get(eurc) ?? 6,
      inputs: [
        encodeV2SwapExactInInput(account, nativeAmountIn, minOut.value, wusdcToEurcPath, payerIsUser),
      ],
    })
  }
}

for (const minOut of uniqueMinOuts(eurcToWusdcAmountOut)) {
  for (const payerIsUser of [true, false]) {
    attempts.push({
      label: `Variant C EURC -> WUSDC -> UNWRAP_WETH, payerIsUser=${payerIsUser}`,
      commands: commands(V2_SWAP_EXACT_IN, UNWRAP_WETH),
      decodedPlan: [
        `V2_SWAP_EXACT_IN(recipient=${universalRouter}, amountIn=${ercAmountIn}, amountOutMin=${minOut.value}, path=[EURC, WUSDC], payerIsUser=${payerIsUser})`,
        `UNWRAP_WETH(recipient=${account}, amountMin=${minOut.value})`,
      ],
      value: 0n,
      amountIn: ercAmountIn,
      amountOutQuoted: eurcToWusdcAmountOut,
      minOut,
      path: eurcToWusdcPath,
      outputDecimals: 18,
      inputs: [
        encodeV2SwapExactInInput(universalRouter, ercAmountIn, minOut.value, eurcToWusdcPath, payerIsUser),
        encodeUnwrapInput(account, minOut.value),
      ],
    })
  }
}

let anySimulationPassed = false

for (const attempt of attempts) {
  console.log(attempt.label)
  console.log('  commands:', attempt.commands)
  console.log('  decoded plan:')
  for (const step of attempt.decodedPlan) console.log('   -', step)
  console.log('  value:', attempt.value.toString(), `(${formatUnits(attempt.value, 18)} native USDC)`)
  console.log('  amountIn:', attempt.amountIn.toString())
  console.log('  amountOut quoted:', attempt.amountOutQuoted?.toString() ?? '(none)')
  if (attempt.amountOutQuoted !== undefined) {
    console.log('  amountOut quoted formatted:', formatUnits(attempt.amountOutQuoted, attempt.outputDecimals))
  }
  console.log('  minAmountOut:', attempt.minOut.value.toString(), `(${attempt.minOut.label})`)
  console.log('  deadline:', deadline.toString())
  console.log('  account:', account)
  console.log('  path:', attempt.path)
  console.log('  inputs:')
  console.dir(attempt.inputs, { depth: 8 })

  try {
    await client.simulateContract({
      address: universalRouter,
      abi: UNIVERSAL_ROUTER_ABI,
      functionName: 'execute',
      args: [attempt.commands, [...attempt.inputs], deadline],
      account,
      value: attempt.value,
      chain: arcTestnet,
    })
    anySimulationPassed = true
    console.log('  success: true')
  } catch (error) {
    printSafeError(error)
  }

  console.log('')
}

console.log('Summary')
console.log('  any UniversalRouter simulation passed:', anySimulationPassed)
console.log('  execution recommendation:', anySimulationPassed
  ? 'A UniversalRouter simulation passed. Enablement still requires reviewing the exact passing command sequence, inputs, approvals, and value handling.'
  : 'Keep UnitFlow quote-only. UniversalRouter execution is not proven by simulation.')
