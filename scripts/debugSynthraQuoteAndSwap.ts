import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createPublicClient,
  defineChain,
  encodePacked,
  formatUnits,
  getFunctionSelector,
  http,
  isAddress,
  type Abi,
  type Address,
  type Hex,
} from 'viem'

const ARC_TESTNET_CHAIN_ID = 5_042_002
const DEFAULT_ARC_RPC_URL = 'https://rpc.testnet.arc.network'
const DEFAULT_SLIPPAGE_BPS = 50n

const SYNTHRA_V3_QUOTER: Address = '0x3Ce954107b1A675826B33bF23060Dd655e3758fE'
const SYNTHRA_V3_SWAP_ROUTER: Address = '0xA545bCB1Bd7985c59ea162aB1748A0803434C31b'
const SYNTHRA_UNIVERSAL_ROUTER: Address = '0xbf4479C07Dc6fdc6dAa764A0ccA06969e894275F'
const USDC: Address = '0x3600000000000000000000000000000000000000'
const EURC: Address = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const SYNTHRA_FEE_TIERS = [500, 3_000, 10_000] as const

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

const SYNTHRA_V3_QUOTER_ABI = [
  {
    type: 'function',
    name: 'quoteExactInputSingle',
    stateMutability: 'nonpayable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'fee', type: 'uint24' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const satisfies Abi

const SYNTHRA_V3_QUOTER_PATH_ABI = [
  {
    type: 'function',
    name: 'quoteExactInput',
    stateMutability: 'nonpayable',
    inputs: [
      { name: 'path', type: 'bytes' },
      { name: 'amountIn', type: 'uint256' },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const satisfies Abi

const SYNTHRA_SWAP_ROUTER_NO_DEADLINE_ABI = [
  {
    type: 'function',
    name: 'exactInputSingle',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const satisfies Abi

const SYNTHRA_SWAP_ROUTER_WITH_DEADLINE_ABI = [
  {
    type: 'function',
    name: 'exactInputSingle',
    stateMutability: 'payable',
    inputs: [
      {
        name: 'params',
        type: 'tuple',
        components: [
          { name: 'tokenIn', type: 'address' },
          { name: 'tokenOut', type: 'address' },
          { name: 'fee', type: 'uint24' },
          { name: 'recipient', type: 'address' },
          { name: 'deadline', type: 'uint256' },
          { name: 'amountIn', type: 'uint256' },
          { name: 'amountOutMinimum', type: 'uint256' },
          { name: 'sqrtPriceLimitX96', type: 'uint160' },
        ],
      },
    ],
    outputs: [{ name: 'amountOut', type: 'uint256' }],
  },
] as const satisfies Abi

type Direction = 'USDC_TO_EURC' | 'EURC_TO_USDC'

type RouterProbe = {
  label: 'exactInputSingle(no deadline)' | 'exactInputSingle(with deadline)'
  status: 'success' | 'reverted' | 'missing_selector'
  error?: unknown
}

type RouterSelectorCheck = {
  noDeadlineSelector: Hex
  withDeadlineSelector: Hex
  hasNoDeadlineSelector: boolean
  hasWithDeadlineSelector: boolean
}

type QuoteCandidate = {
  fee: number
  amountOut: bigint
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

function getField(error: unknown, field: string): unknown {
  if (!error || typeof error !== 'object') return undefined
  return (error as Record<string, unknown>)[field]
}

function getNestedField(error: unknown, field: string): unknown {
  if (!error || typeof error !== 'object') return undefined

  const walk = (error as { walk?: (predicate: (value: unknown) => boolean) => unknown }).walk
  if (typeof walk === 'function') {
    const match = walk((value) => Boolean(getField(value, field)))
    return getField(match, field)
  }

  const cause = getField(error, 'cause')
  return getField(cause, field)
}

function printError(label: string, error: unknown) {
  console.log(label)
  console.log('  name:', getField(error, 'name') ?? '(none)')
  console.log('  shortMessage:', getField(error, 'shortMessage') ?? '(none)')
  console.log('  details:', getField(error, 'details') ?? '(none)')
  console.log('  metaMessages:', getField(error, 'metaMessages') ?? '(none)')
  console.log('  cause.reason:', getNestedField(error, 'reason') ?? '(none)')
  console.log('  raw error data:', getNestedField(error, 'data') ?? getField(error, 'data') ?? '(none)')
}

function isMissingSelectorError(error: unknown): boolean {
  const shortMessage = String(getField(error, 'shortMessage') ?? '').toLowerCase()
  const details = String(getField(error, 'details') ?? '').toLowerCase()
  return shortMessage.includes('returned no data') || details.includes('returned no data')
}

function parseDirection(value: string | undefined): Direction {
  const normalized = value?.trim().toUpperCase().replaceAll('-', '_') ?? 'USDC_TO_EURC'
  if (normalized === 'USDC_TO_EURC' || normalized === 'EURC_TO_USDC') return normalized
  throw new Error(`Invalid SYNTHRA_SIM_DIRECTION: ${value}`)
}

function parseAmountToRaw(amount: string | undefined, decimals: number): bigint {
  const source = (amount ?? '1').trim()
  if (!/^\d+(\.\d+)?$/.test(source)) throw new Error(`Invalid SYNTHRA_SIM_AMOUNT: ${amount}`)
  const [whole, fraction = ''] = source.split('.')
  const paddedFraction = `${fraction}${'0'.repeat(decimals)}`.slice(0, decimals)
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(paddedFraction || '0')
}

function minOut(amountOut: bigint): bigint {
  return amountOut - (amountOut * DEFAULT_SLIPPAGE_BPS) / 10_000n
}

function buildV3Path(tokenIn: Address, tokenOut: Address, fee: number): Hex {
  return encodePacked(['address', 'uint24', 'address'], [tokenIn, fee, tokenOut])
}

async function probeRouterShape(params: {
  account: Address
  amountIn: bigint
  fee: number
  minAmountOut: bigint
  tokenIn: Address
  tokenOut: Address
  recipient: Address
  latestTimestamp: bigint
}, client: ReturnType<typeof createPublicClient>, chain: ReturnType<typeof defineChain>): Promise<RouterProbe[]> {
  const noDeadlineArgs = [{
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    fee: params.fee,
    recipient: params.recipient,
    amountIn: params.amountIn,
    amountOutMinimum: params.minAmountOut,
    sqrtPriceLimitX96: 0n,
  }] as const

  const withDeadlineArgs = [{
    tokenIn: params.tokenIn,
    tokenOut: params.tokenOut,
    fee: params.fee,
    recipient: params.recipient,
    deadline: params.latestTimestamp + 20n * 60n,
    amountIn: params.amountIn,
    amountOutMinimum: params.minAmountOut,
    sqrtPriceLimitX96: 0n,
  }] as const

  const probes: RouterProbe[] = []

  for (const candidate of [
    {
      label: 'exactInputSingle(no deadline)' as const,
      abi: SYNTHRA_SWAP_ROUTER_NO_DEADLINE_ABI,
      args: noDeadlineArgs,
    },
    {
      label: 'exactInputSingle(with deadline)' as const,
      abi: SYNTHRA_SWAP_ROUTER_WITH_DEADLINE_ABI,
      args: withDeadlineArgs,
    },
  ]) {
    try {
      await client.simulateContract({
        address: SYNTHRA_V3_SWAP_ROUTER,
        abi: candidate.abi,
        functionName: 'exactInputSingle',
        args: candidate.args,
        account: params.account,
        chain,
      })
      probes.push({ label: candidate.label, status: 'success' })
    } catch (error) {
      if (isMissingSelectorError(error)) {
        probes.push({ label: candidate.label, status: 'missing_selector', error })
      } else {
        probes.push({ label: candidate.label, status: 'reverted', error })
      }
    }
  }

  return probes
}

async function inspectRouterSelectors(client: ReturnType<typeof createPublicClient>): Promise<RouterSelectorCheck> {
  const noDeadlineSelector = getFunctionSelector('exactInputSingle((address,address,uint24,address,uint256,uint256,uint160))')
  const withDeadlineSelector = getFunctionSelector('exactInputSingle((address,address,uint24,address,uint256,uint256,uint256,uint160))')
  const bytecode = await client.getBytecode({ address: SYNTHRA_V3_SWAP_ROUTER })
  const normalizedBytecode = (bytecode ?? '').toLowerCase()

  return {
    noDeadlineSelector,
    withDeadlineSelector,
    hasNoDeadlineSelector: normalizedBytecode.includes(noDeadlineSelector.slice(2).toLowerCase()),
    hasWithDeadlineSelector: normalizedBytecode.includes(withDeadlineSelector.slice(2).toLowerCase()),
  }
}

loadEnvLocal()

const rpcUrl = process.env.ARC_TESTNET_RPC_URL || DEFAULT_ARC_RPC_URL
const direction = parseDirection(process.env.SYNTHRA_SIM_DIRECTION)
const accountValue = process.env.SYNTHRA_SIM_ACCOUNT || '0x0000000000000000000000000000000000000001'
if (!isAddress(accountValue)) throw new Error(`Invalid SYNTHRA_SIM_ACCOUNT: ${accountValue}`)
const account = accountValue as Address

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
      http: [rpcUrl],
    },
  },
  testnet: true,
})

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

const tokenIn = direction === 'EURC_TO_USDC' ? EURC : USDC
const tokenOut = direction === 'EURC_TO_USDC' ? USDC : EURC
const tokenInSymbol = direction === 'EURC_TO_USDC' ? 'EURC' : 'USDC'
const tokenOutSymbol = direction === 'EURC_TO_USDC' ? 'USDC' : 'EURC'

const [chainId, latestBlock, tokenInDecimals, tokenOutDecimals] = await Promise.all([
  client.getChainId(),
  client.getBlock({ blockTag: 'latest' }),
  client.readContract({ address: tokenIn, abi: ERC20_ABI, functionName: 'decimals' }),
  client.readContract({ address: tokenOut, abi: ERC20_ABI, functionName: 'decimals' }),
])

const amountIn = parseAmountToRaw(process.env.SYNTHRA_SIM_AMOUNT, tokenInDecimals)

const [balance, allowanceToSwapRouter, allowanceToUniversalRouter] = await Promise.all([
  client.readContract({
    address: tokenIn,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [account],
  }),
  client.readContract({
    address: tokenIn,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account, SYNTHRA_V3_SWAP_ROUTER],
  }),
  client.readContract({
    address: tokenIn,
    abi: ERC20_ABI,
    functionName: 'allowance',
    args: [account, SYNTHRA_UNIVERSAL_ROUTER],
  }),
])

const quoteCandidates: QuoteCandidate[] = []
for (const fee of SYNTHRA_FEE_TIERS) {
  try {
    const amountOut = await client.readContract({
      address: SYNTHRA_V3_QUOTER,
      abi: SYNTHRA_V3_QUOTER_ABI,
      functionName: 'quoteExactInputSingle',
      args: [{
        tokenIn,
        tokenOut,
        amountIn,
        fee,
        sqrtPriceLimitX96: 0n,
      }],
    })
    if (amountOut > 0n) quoteCandidates.push({ fee, amountOut })
  } catch {
    // ignore per-fee quote errors
  }
}

const bestQuote = quoteCandidates.reduce<QuoteCandidate | undefined>((best, candidate) => {
  if (!best || candidate.amountOut > best.amountOut) return candidate
  return best
}, undefined)

let pathQuoteAmountOut: bigint | undefined
if (bestQuote) {
  try {
    pathQuoteAmountOut = await client.readContract({
      address: SYNTHRA_V3_QUOTER,
      abi: SYNTHRA_V3_QUOTER_PATH_ABI,
      functionName: 'quoteExactInput',
      args: [buildV3Path(tokenIn, tokenOut, bestQuote.fee), amountIn],
    })
  } catch {
    pathQuoteAmountOut = undefined
  }
}

console.log('Synthra quote + swap diagnostic')
console.log('chain id:', chainId)
console.log('account:', account)
console.log('direction:', direction)
console.log('tokenIn:', `${tokenInSymbol} (${tokenIn})`)
console.log('tokenOut:', `${tokenOutSymbol} (${tokenOut})`)
console.log('amountIn raw:', amountIn.toString())
console.log('amountIn formatted:', formatUnits(amountIn, tokenInDecimals))
console.log('balance raw:', balance.toString())
console.log('balance formatted:', formatUnits(balance, tokenInDecimals))
console.log('allowance to swap router raw:', allowanceToSwapRouter.toString())
console.log('allowance to universal router raw:', allowanceToUniversalRouter.toString())
console.log('quote source:', 'Synthra V3 quoter quoteExactInputSingle(tuple)')
console.log('router address:', SYNTHRA_V3_SWAP_ROUTER)
console.log('quoter address:', SYNTHRA_V3_QUOTER)
console.log('universal router address:', SYNTHRA_UNIVERSAL_ROUTER)
console.log('')

if (!bestQuote) {
  console.log('No valid Synthra quote returned from tuple quoter ABI; execution verification cannot continue.')
  process.exit(0)
}

const minimumAmountOut = minOut(bestQuote.amountOut)
console.log('best fee tier:', bestQuote.fee)
console.log('quote amountOut raw:', bestQuote.amountOut.toString())
console.log('quote amountOut formatted:', formatUnits(bestQuote.amountOut, tokenOutDecimals))
console.log('minAmountOut raw:', minimumAmountOut.toString())
console.log('minAmountOut formatted:', formatUnits(minimumAmountOut, tokenOutDecimals))
console.log('path quote amountOut raw:', pathQuoteAmountOut?.toString() ?? '(unavailable)')
console.log('')

const probes = await probeRouterShape({
  account,
  amountIn,
  fee: bestQuote.fee,
  minAmountOut: minimumAmountOut,
  tokenIn,
  tokenOut,
  recipient: account,
  latestTimestamp: latestBlock.timestamp,
}, client, arcTestnet)
const selectorCheck = await inspectRouterSelectors(client)

console.log('Router ABI probe results')
for (const probe of probes) {
  console.log(`- ${probe.label}: ${probe.status}`)
  if (probe.error) {
    printError('  error details:', probe.error)
  }
}
console.log('')

console.log('Router selector check')
console.log('no-deadline selector:', selectorCheck.noDeadlineSelector, 'present:', selectorCheck.hasNoDeadlineSelector)
console.log('with-deadline selector:', selectorCheck.withDeadlineSelector, 'present:', selectorCheck.hasWithDeadlineSelector)
console.log('')

const noDeadlineProbe = probes.find((probe) => probe.label === 'exactInputSingle(no deadline)')
const withDeadlineProbe = probes.find((probe) => probe.label === 'exactInputSingle(with deadline)')
const routerAbiVerified = Boolean(
  noDeadlineProbe &&
  withDeadlineProbe &&
  noDeadlineProbe.status !== 'missing_selector' &&
  selectorCheck.hasNoDeadlineSelector &&
  !selectorCheck.hasWithDeadlineSelector,
)

console.log('router ABI verified:', routerAbiVerified)
console.log(
  'verification rule:',
  'accept only if no-deadline selector exists/reverts/succeeds, no-deadline selector is in bytecode, and deadline selector is absent from bytecode',
)
console.log('')

if (!routerAbiVerified) {
  console.log('Execution simulation skipped because router ABI shape is not conclusively verified.')
  process.exit(0)
}

const executionArgs = [{
  tokenIn,
  tokenOut,
  fee: bestQuote.fee,
  recipient: account,
  amountIn,
  amountOutMinimum: minimumAmountOut,
  sqrtPriceLimitX96: 0n,
}] as const

console.log('execution args (verified shape):')
console.dir(executionArgs, { depth: 8 })
console.log('')

try {
  const simulation = await client.simulateContract({
    address: SYNTHRA_V3_SWAP_ROUTER,
    abi: SYNTHRA_SWAP_ROUTER_NO_DEADLINE_ABI,
    functionName: 'exactInputSingle',
    args: executionArgs,
    account,
    chain: arcTestnet,
  })

  console.log('simulation result: success')
  console.log('simulation amountOut raw:', simulation.result.toString())
  console.log('simulation amountOut formatted:', formatUnits(simulation.result, tokenOutDecimals))
} catch (error) {
  printError('simulation result: failed', error)
}
