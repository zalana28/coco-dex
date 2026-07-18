import { describe, expect, it } from 'vitest'
import handler, { getPublicVersionMetadata } from './version.js'

function makeReq(method: string) {
  return { method } as unknown as import('@vercel/node').VercelRequest
}
function makeRes() {
  const res: Record<string, unknown> = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: undefined as unknown,
    setHeader(k: string, v: string) {
      ;(res.headers as Record<string, string>)[k] = v
    },
    status(c: number) {
      res.statusCode = c
      return res
    },
    json(payload: unknown) {
      res.body = payload
      return res
    },
  }
  return res as unknown as import('@vercel/node').VercelResponse & {
    body: unknown
    headers: Record<string, string>
  }
}

const forbiddenKeys = [
  'ARC_TESTNET_RPC_URL',
  'CIRCLE_API_KEY',
  'CRON_SECRET',
  'PRIVATE_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_URL',
  'VITE_CIRCLE_API_KEY',
  'VITE_WALLETCONNECT_PROJECT_ID',
]

describe('public version metadata', () => {
  it('returns only allowlisted public fields', () => {
    const metadata = getPublicVersionMetadata({
      VERCEL_ENV: 'preview',
      VERCEL_GIT_COMMIT_SHA: 'abc123',
      BUILD_TIMESTAMP: '2026-07-18T00:00:00.000Z',
      ARC_TESTNET_RPC_URL: 'https://rpc.example/?key=secret',
      CIRCLE_API_KEY: 'circle-secret',
      CRON_SECRET: 'cron-secret',
      PRIVATE_KEY: '0xdeadbeef',
      SUPABASE_SERVICE_ROLE_KEY: 'service-role-secret',
      SUPABASE_URL: 'https://project.supabase.co',
    })

    expect(metadata).toEqual({
      application: 'Coco DEX',
      environment: 'preview',
      gitCommitSha: 'abc123',
      buildTimestamp: '2026-07-18T00:00:00.000Z',
      arcTestnetChainId: 5_042_002,
      features: {
        bridgeCctpV2: true,
        cocoClassicV2: true,
        cocoLiquidity: true,
        routeComparison: true,
        stablePoolBeta: true,
      },
      version: '0.1.0',
    })

    const serialized = JSON.stringify(metadata)
    for (const key of forbiddenKeys) expect(serialized).not.toContain(key)
    expect(serialized).not.toContain('secret')
    expect(serialized).not.toContain('supabase.co')
    expect(serialized).not.toContain('/Users/')
  })

  it('does not reflect unsafe labels or arbitrary environment values', () => {
    const metadata = getPublicVersionMetadata({
      VERCEL_ENV: 'preview\nAuthorization: Bearer secret-typo',
      VERCEL_GIT_COMMIT_SHA: 'abc/../../secret',
      BUILD_TIMESTAMP: '<script>alert(1)</script>',
    })

    expect(metadata.environment).toBe('local')
    expect(metadata.gitCommitSha).toBe('unknown')
    expect(metadata.buildTimestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('serves GET /api/version and rejects other methods', () => {
    const res = makeRes()
    handler(makeReq('POST'), res)
    expect(res.statusCode).toBe(405)
    expect(res.headers.Allow).toBe('GET')
    expect((res.body as { error: string }).error).toBe('Method not allowed')

    const okRes = makeRes()
    handler(makeReq('GET'), okRes)
    expect(okRes.statusCode).toBe(200)
    expect(okRes.headers['Cache-Control']).toContain('s-maxage=60')
  })
})
