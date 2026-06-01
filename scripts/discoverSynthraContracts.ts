type SourceDocument = {
  url: string
  content: string
}

type CandidateHit = {
  address: string
  sourceUrl: string
  context: string
  keywords: string[]
  arcDeploymentContext: boolean
}

const ROOT_URLS = [
  'https://app.synthra.org/',
  'https://docs.synthra.org/',
] as const

const ADDRESS_RE = /0x[a-fA-F0-9]{40}/g
const ASSET_RE = /(?:src|href)=["']([^"']+\.(?:js|css)(?:\?[^"']*)?)["']/g
const KEYWORDS = [
  '5042002',
  'arc testnet',
  'arc',
  'router',
  'quoter',
  'factory',
  'pool',
  'usdc',
  'eurc',
  'swap',
  'quote',
  'getamountsout',
  'exactinput',
  'universalrouter',
  'permit2',
]
const ARC_DEPLOYMENT_MARKERS = ['ChainId.ARC]:{v3', 'ChainId.ARC]:{', 'ARC=5042002', 'Arc Testnet']

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
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
    const response = await fetch(url, {
      headers: {
        'user-agent': 'CocoDEX-SynthraDiscovery/1.0',
      },
    })
    if (!response.ok) {
      console.log(`Fetch failed: ${url} (${response.status})`)
      return undefined
    }
    return await response.text()
  } catch (error) {
    console.log(`Fetch failed: ${url}`)
    console.dir(error, { depth: 4 })
    return undefined
  }
}

function extractAssetUrls(document: SourceDocument): string[] {
  const urls: string[] = []
  for (const match of document.content.matchAll(ASSET_RE)) {
    const assetUrl = resolveAssetUrl(document.url, match[1])
    if (assetUrl) urls.push(assetUrl)
  }
  return unique(urls)
}

function findKeywordHits(context: string): string[] {
  const lower = context.toLowerCase()
  return KEYWORDS.filter((keyword) => lower.includes(keyword))
}

function confidenceForHit(hit: CandidateHit): 'high' | 'medium' | 'low' {
  const strong = ['router', 'quoter', 'factory', 'pool', 'swap', 'quote', 'universalrouter', 'permit2', 'getamountsout', 'exactinput']
  const hasStrongKeyword = hit.keywords.some((keyword) => strong.includes(keyword))
  const hasArcSignal = hit.keywords.includes('5042002') || hit.keywords.includes('arc testnet') || hit.keywords.includes('arc')

  if (hasStrongKeyword && hasArcSignal) return 'high'
  if (hasStrongKeyword || hasArcSignal || hit.keywords.some((keyword) => keyword === 'usdc' || keyword === 'eurc')) return 'medium'
  return 'low'
}

function discoverAddressHits(documents: SourceDocument[]): CandidateHit[] {
  const hits: CandidateHit[] = []

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
      const address = match[0]
      const start = Math.max(0, match.index - 220)
      const end = Math.min(document.content.length, match.index + address.length + 220)
      const context = normalizeWhitespace(document.content.slice(start, end))
      const arcDeploymentContext = arcWindows.some((window) => match.index >= window.start && match.index <= window.end)
      hits.push({
        address,
        sourceUrl: document.url,
        context,
        keywords: findKeywordHits(context),
        arcDeploymentContext,
      })
    }
  }

  return hits
}

function printKeywordSummary(documents: SourceDocument[]) {
  console.log('Keyword search summary')
  for (const document of documents) {
    const lower = document.content.toLowerCase()
    const found = KEYWORDS.filter((keyword) => lower.includes(keyword))
    if (found.length === 0) continue
    console.log(`- ${document.url}`)
    console.log(`  keywords: ${found.join(', ')}`)
  }
  console.log('')
}

const rootDocuments: SourceDocument[] = []
for (const url of ROOT_URLS) {
  const content = await fetchText(url)
  if (content) rootDocuments.push({ url, content })
}

const assetUrls = unique(rootDocuments.flatMap(extractAssetUrls))
const assetDocuments: SourceDocument[] = []
for (const url of assetUrls) {
  const content = await fetchText(url)
  if (content) assetDocuments.push({ url, content })
}

const documents = [...rootDocuments, ...assetDocuments]
const hits = discoverAddressHits(documents)
const grouped = new Map<string, CandidateHit[]>()

for (const hit of hits) {
  const key = hit.address.toLowerCase()
  const current = grouped.get(key) ?? []
  current.push(hit)
  grouped.set(key, current)
}

console.log('Synthra contract discovery')
console.log('Fetched root URLs:')
for (const document of rootDocuments) console.log(`- ${document.url} (${document.content.length} bytes)`)
console.log('')
console.log('Fetched linked assets:')
for (const document of assetDocuments) console.log(`- ${document.url} (${document.content.length} bytes)`)
console.log('')

printKeywordSummary(documents)

console.log('Candidate addresses')
if (grouped.size === 0) {
  console.log('No 0x Ethereum addresses found in fetched Synthra app/docs assets.')
} else {
  for (const [address, addressHits] of [...grouped.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const mergedKeywords = unique(addressHits.flatMap((hit) => hit.keywords))
    const confidence = addressHits.map(confidenceForHit).includes('high')
      ? 'high'
      : addressHits.map(confidenceForHit).includes('medium')
        ? 'medium'
        : 'low'

    console.log(`- ${address}`)
    console.log(`  confidence: ${confidence}`)
    console.log(`  keywords: ${mergedKeywords.length > 0 ? mergedKeywords.join(', ') : '(none)'}`)
    if (addressHits.some((hit) => hit.arcDeploymentContext)) console.log('  arc deployment context: yes')

    for (const hit of addressHits.slice(0, 4)) {
      console.log(`  source: ${hit.sourceUrl}`)
      console.log(`  context: ${hit.context}`)
    }
  }
}
