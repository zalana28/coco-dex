import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()
const read = (path: string) => readFileSync(join(root, path), 'utf8')

function filesUnder(path: string): string[] {
  const absolute = join(root, path)
  return readdirSync(absolute).flatMap((name) => {
    const entry = join(absolute, name)
    return statSync(entry).isDirectory() ? filesUnder(relative(root, entry)) : [relative(root, entry)]
  })
}

describe('public proof and compliance configuration', () => {
  it('keeps bridge implementation publicly routed and navigable', () => {
    const app = read('src/App.tsx')
    const header = read('src/components/layout/Header.tsx')
    const packages = JSON.parse(read('package-lock.json')) as { packages: Record<string, { version?: string }> }

    expect(app).toContain('path="/bridge"')
    expect(app).toContain("import('@/pages/BridgePage')")
    expect(header).toContain("{ to: '/bridge', label: 'Bridge' }")
    expect(packages.packages['node_modules/@circle-fin/bridge-kit']?.version).toBe('1.12.1')
    expect(packages.packages['node_modules/@circle-fin/adapter-viem-v2']?.version).toBe('1.14.0')
  })

  it('uses cron-job.org as the single canonical scheduler', () => {
    const vercel = JSON.parse(read('vercel.json')) as Record<string, unknown>
    const readme = read('README.md')
    const analyticsDocs = read('docs/analytics.md')

    expect(vercel).not.toHaveProperty('crons')
    expect(readme).toContain('canonical production scheduler is cron-job.org')
    expect(readme).toMatch(/every (?:\*\*)?15 minutes/)
    expect(readme).toContain('Authorization: Bearer')
    expect(readme).toMatch(/do not also enable Vercel Cron/i)
    expect(analyticsDocs).toContain('cron-job.org')
    expect(analyticsDocs).toContain('15 minutes')
    expect(`${readme}\n${analyticsDocs}`).not.toContain('every 5-15 minutes')
  })

  it('stays within the Vercel Hobby function limit while serving /api/version', () => {
    const entrypoints = filesUnder('api').filter((path) =>
      path.endsWith('.ts') &&
      !path.endsWith('.test.ts') &&
      !path.includes('/_lib/'),
    )
    const vercel = read('vercel.json')

    expect(entrypoints).toHaveLength(12)
    expect(entrypoints).not.toContain('api/version.ts')
    expect(vercel).toContain('"source": "/api/version"')
    expect(vercel).toContain('"destination": "/api/health?publicVersion=1"')
  })

  it('keeps README and public Docs synchronized with implemented Bridge facts', () => {
    const readme = read('README.md')
    const docs = read('src/pages/DocsPage.tsx')
    const publicDocumentation = `${readme}\n${docs}`

    for (const fact of [
      'Coco Classic V2',
      'Ethereum Sepolia',
      'Base Sepolia',
      'CCTP V2',
      'Circle Bridge Kit',
      'Forwarding Service',
      'retryBridge',
      '5042002',
      'domain is 26',
      '6 decimals',
      '18-decimal',
      '/api/circle/health',
    ]) expect(publicDocumentation).toContain(fact)

    expect(publicDocumentation).toContain('EURC is not offered by the CCTP Bridge page')
    expect(publicDocumentation).not.toMatch(/CCTP.{0,80}(?:not implemented|future bridge)/i)
    expect(publicDocumentation).toContain('not routed')
    expect(publicDocumentation).toContain('External route availability and liquidity are not guaranteed')
  })

  it('declares enforced baseline headers and CSP report-only without broad wildcards', () => {
    const vercel = JSON.parse(read('vercel.json')) as { headers: Array<{ headers: Array<{ key: string; value: string }> }> }
    const headers = Object.fromEntries(vercel.headers[0]!.headers.map(({ key, value }) => [key, value]))
    const csp = headers['Content-Security-Policy-Report-Only']

    expect(headers['X-Content-Type-Options']).toBe('nosniff')
    expect(headers['Referrer-Policy']).toBe('strict-origin-when-cross-origin')
    expect(headers['X-Frame-Options']).toBe('DENY')
    expect(headers['Permissions-Policy']).toContain('camera=()')
    expect(headers).not.toHaveProperty('Content-Security-Policy')
    expect(csp).toContain("default-src 'self'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).not.toMatch(/script-src[^;]*(?:'unsafe-eval'|'unsafe-inline')/)
    expect(csp).not.toMatch(/connect-src[^;]*(?:\*|\shttps:;|\swss:;|\.supabase\.co|\.vercel\.app)/)
  })

  it('avoids forbidden Arc product naming and endorsement claims in public UI', () => {
    const publicUi = filesUnder('src').filter((path) => /\.(?:ts|tsx)$/.test(path) && !path.endsWith('.test.ts')).map(read).join('\n')
    for (const wording of ['Arc DEX', 'The Arc Exchange', 'Arc by Coco DEX', 'Arc App']) {
      expect(publicUi).not.toContain(wording)
    }
  })

  it('does not introduce analytics or tracking dependencies', () => {
    const packageJson = read('package.json')
    const source = filesUnder('src').filter((path) => /\.(?:ts|tsx)$/.test(path) && !path.endsWith('.test.ts')).map(read).join('\n')
    for (const marker of ['@vercel/analytics', 'google-analytics.com', 'googletagmanager.com', 'mixpanel', 'segment.io', 'posthog']) {
      expect(`${packageJson}\n${source}`).not.toContain(marker)
    }
  })
})