import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  createPublicClient,
  defineChain,
  encodePacked,
  formatUnits,
  http,
  isAddress,
  type Abi,
  type Address,
  type Hex,
} from 'viem'

const ARC_TESTNET_CHAIN_ID = 5_042_002
const DEFAULT_ARC_RPC_URL = 'https://rpc.testnet.arc.network'
const ROOT_URLS = ['https://app.synthra.org/', 'https://docs.synthra.org/'] as const
const USDC = '0x3600000000000000000000000000000000000000'
const EURC = '0x89B50855Aa3bE2F677cD6303Cec089B5F319D72a'
const ADDRESS_RE = /0x[a-fA-F0-9]{40}/g
const ASSET_RE = /(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g
const KEYWORDS = ['5042002', 'arc', 'router', 'quoter', 'factory', 'pool', 'usdc', 'eurc', 'swap', 'quote', 'getamountsout', 'exactinput']
const ARC_DEPLOYMENT_MARKERS = ['ChainId.ARC]:{v3', 'ChainId.ARC]:{', 'ARC=5042002', 'Arc Testnet']

const ERC20_ABI = [
  {
    type: 'function',
    name: 'decimals',
    stateMutability: 'view',
    inputs: [],
    outputs: [{ name: '', type: 'uint8' }],
  },
] as const satisfies Abi

const QUOTE_ABIS = {
  getAmountsOut: [
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
  ] as const satisfies Abi,
  quoteExactInput: [
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
  ] as const satisfies Abi,
  quoteExactInputSingle: [
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
  ] as const satisfies Abi,
  quoteExactInputSingleTuple: [
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
  ] as const satisfies Abi,
  getAmountOutTokenFirst: [
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
  ] as const satisfies Abi,
  getAmountOutAmountFirst: [
    {
      type: 'function',
      name: 'getAmountOut',
      stateMutability: 'view',
      inputs: [
        { name: 'amountIn', type: 'uint256' },
        { name: 'tokenIn', type: 'address' },
        { name: 'tokenOut', type: 'address' },
      ],
      outputs: [{ name: '', type: 'uint256' }],
    },
  ] as const satisfies Abi,
}

type SourceDocument = {
  url: string
  content: string
}

type Candidate = {
  address: Address
  confidence: 'high' | 'medium' | 'low'
  sources: string[]
  keywords: string[]
  arcDeploymentContext: boolean
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
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1)
    process.env[key] ??= value
  }
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
  return getField(getField(error, 'cause'), field)
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

function resolveAssetUrl(baseUrl: string, assetPath: string): string | undefined {
  try {
    return new URL(assetPath, baseUrl).toString()
  } catch {
    return undefined
  }
}

async function fetchText(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, { headers: { 'user-agent': 'CocoDEX-SynthraDebug/1.0' } })
    if (!response.ok) return undefined
    return await response.text()
  } catch {
    return undefined
  }
}

function confidenceForContext(context: string): 'high' | 'medium' | 'low' {
  const lower = context.toLowerCase()
  const hasArc = lower.includes('5042002') || lower.includes('arc')
  const hasQuote = ['router', 'quoter', 'factory', 'pool', 'swap', 'quote', 'getamountsout', 'exactinput'].some((keyword) => lower.includes(keyword))
  if (hasArc && hasQuote) return 'high'
  if (hasArc || hasQuote || lower.includes('usdc') || lower.includes('eurc')) return 'medium'
  return 'low'
}

async function discoverCandidates(): Promise<Candidate[]> {
  const roots: SourceDocument[] = []
  for (const url of ROOT_URLS) {
    const content = await fetchText(url)
    if (content) roots.push({ url, content })
  }

  const assets = [...new Set(roots.flatMap((document) => {
    const urls: string[] = []
    for (const match of document.content.matchAll(ASSET_RE)) {
      const assetUrl = resolveAssetUrl(document.url, match[1])
      if (assetUrl) urls.push(assetUrl)
    }
    return urls
  }))]

  const documents = [...roots]
  for (const url of assets) {
    const content = await fetchText(url)
    if (content) documents.push({ url, content })
  }

  const grouped = new Map<string, { contexts: string[]; sources: string[]; keywords: string[]; arcDeploymentContext: boolean }>()
  for (const document of documents) {
    const arcWindows = ARC_DEPLOYMENT_MARKERS.flatMap((marker) => {
      const windows: Array<{ start: number; end: number }> = []
      let index = document.content.indexOf(marker)
      while (index !== -1) {
        windows.push({
          start: index,
          end: Math.min(document.content.length, index + 1_000),
        })
        index = document.content.indexOf(marker, index + marker.length)
      }
      return windows
    })

    for (const match of document.content.matchAll(ADDRESS_RE)) {
      if (!isAddress(match[0])) continue
      const start = Math.max(0, match.index - 220)
      const end = Math.min(document.content.length, match.index + match[0].length + 220)
      const context = document.content.slice(start, end).replace(/\s+/g, ' ').trim()
      const lower = context.toLowerCase()
      const keywords = KEYWORDS.filter((keyword) => lower.includes(keyword))
      const key = match[0].toLowerCase()
      const current = grouped.get(key) ?? { contexts: [], sources: [], keywords: [], arcDeploymentContext: false }
      current.contexts.push(context)
      current.sources.push(document.url)
      current.keywords.push(...keywords)
      current.arcDeploymentContext ||= arcWindows.some((window) => match.index >= window.start && match.index <= window.end)
      grouped.set(key, current)
    }
  }

  return [...grouped.entries()].map(([address, data]) => {
    const confidence = data.contexts.map(confidenceForContext).includes('high')
      ? 'high'
      : data.contexts.map(confidenceForContext).includes('medium')
        ? 'medium'
        : 'low'
    return {
      address: address as Address,
      confidence,
      sources: [...new Set(data.sources)],
      keywords: [...new Set(data.keywords)],
      arcDeploymentContext: data.arcDeploymentContext,
    }
  })
}

function shouldProbeCandidate(candidate: Candidate): boolean {
  const address = candidate.address.toLowerCase()
  if (/^0x0{40}$/.test(address)) return false
  if (/^0x0{39}[12]$/.test(address)) return false
  if (/^0xe{40}$/.test(address)) return false

  return candidate.arcDeploymentContext || candidate.keywords.includes('5042002')
}

function buildV3Path(tokenIn: Address, tokenOut: Address, fee: number): Hex {
  return encodePacked(['address', 'uint24', 'address'], [tokenIn, fee, tokenOut])
}

const successfulQuotes: Array<{ candidate: Address; direction: string; label: string; amountOut: bigint; amountOutFormatted: string }> = []
let activeCandidate: Address | undefined
let activeDirection = ''

async function tryQuote(label: string, fn: () => Promise<bigint | readonly bigint[]>, outputDecimals: number) {
  console.log(`  ${label}`)
  try {
    const result = await fn()
    const amountOut = Array.isArray(result) ? result[result.length - 1] ?? 0n : result
    const amountOutFormatted = formatUnits(amountOut, outputDecimals)
    console.log('    success: true')
    console.log('    amountOut:', amountOut.toString())
    console.log('    amountOut formatted:', amountOutFormatted)
    if (activeCandidate) successfulQuotes.push({ candidate: activeCandidate, direction: activeDirection, label, amountOut, amountOutFormatted })
  } catch (error) {
    printSafeError(error)
  }
}

loadEnvLocal()

const rpcUrl = process.env.ARC_TESTNET_RPC_URL || DEFAULT_ARC_RPC_URL
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

const usdc = USDC as Address
const eurc = EURC as Address
const candidates = await discoverCandidates()
const candidatesToProbe = candidates.filter(shouldProbeCandidate)

console.log('Synthra quote diagnostic')
console.log('chainId:', ARC_TESTNET_CHAIN_ID)
console.log('rpcUrl:', rpcUrl)
console.log('candidate count:', candidates.length)
console.log('candidate probe count:', candidatesToProbe.length)
console.log('')

const [usdcDecimals, eurcDecimals] = await Promise.all([
  client.readContract({ address: usdc, abi: ERC20_ABI, functionName: 'decimals' }),
  client.readContract({ address: eurc, abi: ERC20_ABI, functionName: 'decimals' }),
])
console.log('Token decimals')
console.log('  USDC:', usdcDecimals)
console.log('  EURC:', eurcDecimals)
console.log('')

if (candidatesToProbe.length === 0) {
  console.log('No Synthra candidate addresses discovered from app/docs assets. Quote probing skipped.')
  process.exit(0)
}

for (const candidate of candidatesToProbe) {
  activeCandidate = candidate.address
  console.log(`Candidate ${candidate.address}`)
  console.log('  confidence:', candidate.confidence)
  console.log('  arc deployment context:', candidate.arcDeploymentContext)
  console.log('  keywords:', candidate.keywords.length > 0 ? candidate.keywords.join(', ') : '(none)')
  console.log('  sources:', candidate.sources.join(', '))

  const bytecode = await client.getBytecode({ address: candidate.address })
  const byteLength = bytecode ? (bytecode.length - 2) / 2 : 0
  console.log('  bytecode exists:', byteLength > 0)
  console.log('  bytecode bytes:', byteLength)
  if (byteLength === 0) {
    console.log('')
    continue
  }

  const directions = [
    { label: 'USDC -> EURC', tokenIn: usdc, tokenOut: eurc, amountIn: 10n ** BigInt(usdcDecimals), outputDecimals: eurcDecimals },
    { label: 'EURC -> USDC', tokenIn: eurc, tokenOut: usdc, amountIn: 10n ** BigInt(eurcDecimals), outputDecimals: usdcDecimals },
  ]

  for (const direction of directions) {
    activeDirection = direction.label
    console.log(`  Direction ${direction.label}`)
    await tryQuote('getAmountsOut(uint256,address[])', () => client.readContract({
      address: candidate.address,
      abi: QUOTE_ABIS.getAmountsOut,
      functionName: 'getAmountsOut',
      args: [direction.amountIn, [direction.tokenIn, direction.tokenOut]],
    }), direction.outputDecimals)

    await tryQuote('getAmountOut(address,address,uint256)', () => client.readContract({
      address: candidate.address,
      abi: QUOTE_ABIS.getAmountOutTokenFirst,
      functionName: 'getAmountOut',
      args: [direction.tokenIn, direction.tokenOut, direction.amountIn],
    }), direction.outputDecimals)

    await tryQuote('getAmountOut(uint256,address,address)', () => client.readContract({
      address: candidate.address,
      abi: QUOTE_ABIS.getAmountOutAmountFirst,
      functionName: 'getAmountOut',
      args: [direction.amountIn, direction.tokenIn, direction.tokenOut],
    }), direction.outputDecimals)

    for (const fee of [100, 500, 3_000, 10_000] as const) {
      await tryQuote(`quoteExactInputSingle positional fee ${fee}`, () => client.readContract({
        address: candidate.address,
        abi: QUOTE_ABIS.quoteExactInputSingle,
        functionName: 'quoteExactInputSingle',
        args: [direction.tokenIn, direction.tokenOut, fee, direction.amountIn, 0n],
      }), direction.outputDecimals)

      await tryQuote(`quoteExactInputSingle tuple fee ${fee}`, () => client.readContract({
        address: candidate.address,
        abi: QUOTE_ABIS.quoteExactInputSingleTuple,
        functionName: 'quoteExactInputSingle',
        args: [{ tokenIn: direction.tokenIn, tokenOut: direction.tokenOut, amountIn: direction.amountIn, fee, sqrtPriceLimitX96: 0n }],
      }), direction.outputDecimals)

      await tryQuote(`quoteExactInput(bytes,uint256) fee ${fee}`, () => client.readContract({
        address: candidate.address,
        abi: QUOTE_ABIS.quoteExactInput,
        functionName: 'quoteExactInput',
        args: [buildV3Path(direction.tokenIn, direction.tokenOut, fee), direction.amountIn],
      }), direction.outputDecimals)
    }
  }

  console.log('')
}

console.log('Successful quote summary')
if (successfulQuotes.length === 0) {
  console.log('No successful Synthra quote calls found.')
} else {
  for (const quote of successfulQuotes) {
    console.log(`- ${quote.candidate} ${quote.direction} ${quote.label}: ${quote.amountOut.toString()} (${quote.amountOutFormatted})`)
  }
}
