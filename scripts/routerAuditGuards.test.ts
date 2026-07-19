import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const filesUnder = (directory: string): string[] => readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
  const relative = `${directory}/${entry.name}`
  return entry.isDirectory() ? filesUnder(relative) : [relative]
})

describe('router audit deployment and execution guards', () => {
  it('adds no deployable API function and stays at the Vercel Hobby limit', () => {
    const entrypoints = filesUnder('api').filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts') && !path.includes('/_lib/'))
    expect(entrypoints).toHaveLength(12)
    expect(entrypoints).not.toContain('api/router-audit.ts')
  })

  it('introduces no Vercel Cron', () => {
    const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8')) as Record<string, unknown>
    expect(vercel).not.toHaveProperty('crons')
  })

  it('contains no broadcast method, private key, mnemonic, signer, or wallet client in audit implementation', () => {
    const auditFiles = filesUnder('src/lib/router-audit').filter((path) => path.endsWith('.ts') && !path.endsWith('.test.ts'))
      .concat(filesUnder('scripts').filter((path) => path.includes('routerAudit') && !path.endsWith('.test.ts')))
    const source = auditFiles.map((path) => readFileSync(resolve(root, path), 'utf8')).join('\n')
    expect(source).not.toMatch(/eth_send(?:Raw)?Transaction|personal_sendTransaction|wallet_sendTransaction/)
    expect(source).not.toMatch(/privateKeyToAccount|mnemonicToAccount|createWalletClient|useWalletClient|requestAddresses/)
    expect(source).not.toMatch(/PRIVATE_KEY|MNEMONIC|SEED_PHRASE/)
  })

  it('gitignores router audit artifacts', () => {
    const ignored = execFileSync('git', ['check-ignore', 'artifacts/router-audit/audit-report.json'], { cwd: root, encoding: 'utf8' }).trim()
    expect(ignored).toBe('artifacts/router-audit/audit-report.json')
  })

  it('keeps every repository provenance path real', async () => {
    const { ROUTER_AUDIT_REGISTRY } = await import('../src/lib/router-audit/registry')
    const repoSources = ROUTER_AUDIT_REGISTRY.flatMap((provider) => [
      ...provider.evidenceSources,
      ...provider.abiProvenance,
      ...provider.sourceCodeProvenance,
      ...provider.inventoryCandidates.flatMap((candidate) => candidate.provenance),
      ...provider.conflictingCandidates.flatMap((candidate) => candidate.provenance),
    ]).filter(({ reference }) => reference.startsWith('contracts/'))
    expect(repoSources.length).toBeGreaterThan(0)
    for (const source of repoSources) expect(existsSync(resolve(root, source.reference))).toBe(true)
  })

  it('keeps runtime route selection, Bridge, contracts, API version, and Vercel config outside the audit module', () => {
    expect(statSync(resolve(root, 'src/lib/router-audit')).isDirectory()).toBe(true)
    const changed = execFileSync('git', ['diff', '--name-only', 'origin/main'], { cwd: root, encoding: 'utf8' })
    expect(changed).not.toMatch(/^api\//m)
    expect(changed).not.toMatch(/^vercel\.json$/m)
    expect(changed).not.toMatch(/^src\/lib\/router\//m)
    expect(changed).not.toMatch(/^src\/features\/bridge\//m)
    expect(changed).not.toMatch(/^src\/pages\/(?:BridgePage|SwapPage)\.tsx$/m)
    expect(changed).not.toMatch(/^contracts\/(?:src|script|deployments)\//m)
  })
})