import type { VercelRequest, VercelResponse } from '@vercel/node'
import packageJson from '../package.json' with { type: 'json' }

const FALLBACK_BUILD_TIMESTAMP = new Date().toISOString()

const PUBLIC_FEATURE_FLAGS = {
  bridgeCctpV2: true,
  cocoClassicV2: true,
  cocoLiquidity: true,
  routeComparison: true,
  stablePoolBeta: true,
} as const

export type PublicVersionMetadata = {
  application: string
  environment: string
  gitCommitSha: string
  buildTimestamp: string
  arcTestnetChainId: number
  features: typeof PUBLIC_FEATURE_FLAGS
  version: string
}

function publicLabel(value: string | undefined, fallback: string) {
  const normalized = value?.trim()
  return normalized && /^[a-zA-Z0-9._-]{1,128}$/.test(normalized) ? normalized : fallback
}

function publicTimestamp(value: string | undefined) {
  if (!value) return FALLBACK_BUILD_TIMESTAMP
  const parsed = new Date(value)
  return Number.isNaN(parsed.valueOf()) ? FALLBACK_BUILD_TIMESTAMP : parsed.toISOString()
}

export function getPublicVersionMetadata(env: NodeJS.ProcessEnv = process.env): PublicVersionMetadata {
  return {
    application: 'Coco DEX',
    environment: publicLabel(env.VERCEL_ENV ?? env.PUBLIC_APP_ENV, 'local'),
    gitCommitSha: publicLabel(env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA, 'unknown'),
    buildTimestamp: publicTimestamp(env.VERCEL_BUILD_TIMESTAMP ?? env.BUILD_TIMESTAMP),
    arcTestnetChainId: 5_042_002,
    features: PUBLIC_FEATURE_FLAGS,
    version: packageJson.version,
  }
}

export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=60, stale-while-revalidate=300')
  return res.status(200).json(getPublicVersionMetadata())
}
