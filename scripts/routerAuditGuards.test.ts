import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = resolve(import.meta.dirname, '..')
const filesUnder = (directory: string): string[] => readdirSync(resolve(root, directory), { withFileTypes: true }).flatMap((entry) => {
  const relative = `${directory}/${entry.name}`
  return entry.isDirectory() ? filesUnder(relative) : [relative]
})

function gitStdout(args: string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
}

function resolvesToCommit(ref: string): boolean {
  try {
    execFileSync('git', ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`], { cwd: root, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] })
    return true
  } catch {
    return false
  }
}

/**
 * Fail-closed base-ref resolver.
 *
 * Candidate order:
 *   1. ROUTER_AUDIT_BASE_REF (explicit override)
 *   2. origin/${GITHUB_BASE_REF} (pull-request context)
 *   3. origin/main
 *   4. local main
 *
 * Returns the first candidate that resolves to a commit. Throws an actionable
 * sanitized error if no candidate resolves — never returns an empty diff or
 * silently skips the scope guard.
 *
 * Accepts an optional explicit candidate list for deterministic testing; when
 * omitted, the standard candidate order above is used.
 */
export function resolveAuditBaseRef(candidates?: string[]): string {
  const list = candidates ?? (() => {
    const c: string[] = []
    const explicit = process.env.ROUTER_AUDIT_BASE_REF
    if (explicit) c.push(explicit)
    const baseRef = process.env.GITHUB_BASE_REF
    if (baseRef) c.push(`origin/${baseRef}`)
    c.push('origin/main', 'main')
    return c
  })()

  for (const candidate of list) {
    if (resolvesToCommit(candidate)) return candidate
  }
  throw new Error(
    'Router audit scope guard could not resolve a valid base ref. ' +
      'Fetch the PR base branch (e.g. `git fetch origin main:refs/remotes/origin/main`) or set ROUTER_AUDIT_BASE_REF. ' +
      'The guard fails closed: a missing base ref is not treated as an empty changed-file list.',
  )
}

/**
 * Returns the complete PR changed-file list using the merge base of the
 * resolved base ref and HEAD. Uses `base...HEAD` triple-dot semantics so
 * multi-commit branches and synthetic merge commits are handled correctly.
 */
export function changedFilesAgainstBase(): string[] {
  const baseRef = resolveAuditBaseRef()
  const files = gitStdout(['diff', '--name-only', '--diff-filter=ACMRT', `${baseRef}...HEAD`])
  return files.split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
}

describe('router audit base-ref resolver', () => {
  it('resolves origin/main when present', () => {
    const base = resolveAuditBaseRef()
    expect(resolvesToCommit(base)).toBe(true)
  })

  it('prefers an explicit ROUTER_AUDIT_BASE_REF override', () => {
    const prior = process.env.ROUTER_AUDIT_BASE_REF
    try {
      process.env.ROUTER_AUDIT_BASE_REF = 'origin/main'
      expect(resolveAuditBaseRef()).toBe('origin/main')
    } finally {
      if (prior === undefined) delete process.env.ROUTER_AUDIT_BASE_REF
      else process.env.ROUTER_AUDIT_BASE_REF = prior
    }
  })

  it('uses GITHUB_BASE_REF when origin/main is unavailable but the PR base ref exists', () => {
    const priorBase = process.env.GITHUB_BASE_REF
    const priorExplicit = process.env.ROUTER_AUDIT_BASE_REF
    try {
      delete process.env.ROUTER_AUDIT_BASE_REF
      process.env.GITHUB_BASE_REF = 'main'
      const base = resolveAuditBaseRef()
      expect(resolvesToCommit(base)).toBe(true)
    } finally {
      if (priorBase === undefined) delete process.env.GITHUB_BASE_REF
      else process.env.GITHUB_BASE_REF = priorBase
      if (priorExplicit === undefined) delete process.env.ROUTER_AUDIT_BASE_REF
      else process.env.ROUTER_AUDIT_BASE_REF = priorExplicit
    }
  })

  it('throws a sanitized actionable error when no candidate resolves', () => {
    expect(() => resolveAuditBaseRef(['refs/heads/nonexistent-branch-xyz', 'origin/nonexistent-branch-xyz'])).toThrow(/could not resolve a valid base ref/)
  })

  it('trims and filters empty lines from the changed-file output', () => {
    const changed = changedFilesAgainstBase()
    expect(changed.every((line) => line.trim() === line && line.length > 0)).toBe(true)
  })

  it('uses the full merge-base diff, not HEAD~1', () => {
    const base = resolveAuditBaseRef()
    const mergeBase = gitStdout(['merge-base', base, 'HEAD']).trim()
    const expected = gitStdout(['diff', '--name-only', '--diff-filter=ACMRT', `${mergeBase}`, 'HEAD'])
      .split('\n').map((line) => line.trim()).filter((line) => line.length > 0)
    expect(changedFilesAgainstBase()).toEqual(expected)
  })

  it('still detects prohibited file changes in the diff', () => {
    const changed = changedFilesAgainstBase()
    // Exact-path allowlist for intentionally permitted router files.
    const allowedRouterFiles = new Set([
      'src/lib/router/executionPolicy.ts',
      'src/lib/router/executionPolicy.test.ts',
      'src/lib/router/xylonetAdapter.ts',
      'src/lib/router/routerShadowMode.test.ts',
      'src/lib/router/xylonetAdapter.test.ts',
      'src/lib/router/quoteState.ts',
      'src/lib/router/quoteState.test.ts',
      'src/lib/router/selectBestRoute.ts',
      'src/lib/router/synthraAdapter.ts',
      'src/lib/router/types.ts',
      'src/lib/router/synthraAdapter.test.ts',
      'src/lib/router/selectBestRoute.test.ts',
      // unitflow liquidity guard (PR #111)
      'src/lib/router/unitflowAdapter.ts',
      'src/lib/router/unitflowAdapter.test.ts',
      // contract address verification (PR #111)
      'src/lib/router/contractVerification.ts',
      'src/lib/router/contractVerification.test.ts',
      // Coco price-impact guard (Phase 2)
      'src/lib/router/cocoAdapter.ts',
      'src/lib/router/cocoAdapter.test.ts',
    ])
    expect(changed).not.toContain('vercel.json')
    expect(changed.some((file) => file.startsWith('api/') && !file.startsWith('api/_lib/'))).toBe(false)
    expect(changed.some((file) => file.startsWith('contracts/src/') || file.startsWith('contracts/script/') || file.startsWith('contracts/deployments/'))).toBe(false)
    const routerHit = changed.some((file) => file.startsWith('src/lib/router/') && !file.startsWith('src/lib/router-audit/') && !allowedRouterFiles.has(file))
    expect(routerHit).toBe(false)
    // This bridge-fix PR intentionally modifies the CCTP browser-wallet bridge
    // under src/features/bridge and BridgePage.tsx. Those are permitted here; what
    // must remain prohibited is any api/, contracts/, vercel.json, or router-audit
    // change, plus any unexpected src/pages change beyond BridgePage/SwapPage.
    const allowedBridgeFiles = new Set([
      'src/features/bridge/amounts.ts',
      'src/features/bridge/bridge.test.ts',
      'src/features/bridge/chains.ts',
      'src/features/bridge/e2eHarness.ts',
      'src/features/bridge/errors.ts',
      'src/features/bridge/estimate.ts',
      'src/features/bridge/facade.ts',
      'src/features/bridge/index.ts',
      'src/features/bridge/params.ts',
      'src/features/bridge/params.test.ts',
      'src/features/bridge/postBridge.ts',
      'src/features/bridge/recovery.ts',
      'src/features/bridge/result.ts',
      'src/features/bridge/attempt.ts',
      'src/features/bridge/lifecycle.ts',
      'src/features/bridge/lifecycle.test.ts',
      'src/features/bridge/events.ts',
      'src/features/bridge/iris.ts',
      'src/features/bridge/explorer.ts',
      'src/features/bridge/recovery-store.test.ts',
      'docs/cctp-arc-manual-test.md',
      'docs/cctp-arc-lifecycle-recovery-manual-test.md',
      'tests/e2e/bridge-fee.spec.ts',
      'tests/e2e/bridge-lifecycle.spec.ts',
    ])
    const bridgeHit = changed.some((file) => file.startsWith('src/features/bridge/') && !allowedBridgeFiles.has(file))
    expect(bridgeHit).toBe(false)
    // This PR intentionally modifies BridgePage.tsx for the CCTP fix; SwapPage stays prohibited.
    const PROHIBITED_PAGES = new Set(['src/pages/BridgePage.tsx', 'src/pages/SwapPage.tsx'])
    expect(changed.some((file) => /^src\/pages\/(?:BridgePage|SwapPage)\.tsx$/.test(file) && !PROHIBITED_PAGES.has(file))).toBe(false)
  })

  it('new PR #111 allowlist paths are accepted by the guard', () => {
    const allowedRouterFiles = new Set([
      'src/lib/router/executionPolicy.ts',
      'src/lib/router/executionPolicy.test.ts',
      'src/lib/router/xylonetAdapter.ts',
      'src/lib/router/routerShadowMode.test.ts',
      'src/lib/router/xylonetAdapter.test.ts',
      'src/lib/router/quoteState.ts',
      'src/lib/router/quoteState.test.ts',
      'src/lib/router/selectBestRoute.ts',
      'src/lib/router/synthraAdapter.ts',
      'src/lib/router/types.ts',
      'src/lib/router/synthraAdapter.test.ts',
      'src/lib/router/selectBestRoute.test.ts',
      'src/lib/router/unitflowAdapter.ts',
      'src/lib/router/unitflowAdapter.test.ts',
      'src/lib/router/contractVerification.ts',
      'src/lib/router/contractVerification.test.ts',
      // Coco price-impact guard (Phase 2)
      'src/lib/router/cocoAdapter.ts',
      'src/lib/router/cocoAdapter.test.ts',
    ])
    const pr111Files = [
      'src/lib/router/unitflowAdapter.ts',
      'src/lib/router/unitflowAdapter.test.ts',
      'src/lib/router/contractVerification.ts',
      'src/lib/router/contractVerification.test.ts',
    ]
    for (const file of pr111Files) {
      expect(allowedRouterFiles.has(file)).toBe(true)
    }
  })

  it('unlisted router files are still prohibited after PR #111 allowlist additions', () => {
    const allowedRouterFiles = new Set([
      'src/lib/router/executionPolicy.ts',
      'src/lib/router/executionPolicy.test.ts',
      'src/lib/router/xylonetAdapter.ts',
      'src/lib/router/routerShadowMode.test.ts',
      'src/lib/router/xylonetAdapter.test.ts',
      'src/lib/router/quoteState.ts',
      'src/lib/router/quoteState.test.ts',
      'src/lib/router/selectBestRoute.ts',
      'src/lib/router/synthraAdapter.ts',
      'src/lib/router/types.ts',
      'src/lib/router/synthraAdapter.test.ts',
      'src/lib/router/selectBestRoute.test.ts',
      'src/lib/router/unitflowAdapter.ts',
      'src/lib/router/unitflowAdapter.test.ts',
      'src/lib/router/contractVerification.ts',
      'src/lib/router/contractVerification.test.ts',
      // Coco price-impact guard (Phase 2)
      'src/lib/router/cocoAdapter.ts',
      'src/lib/router/cocoAdapter.test.ts',
    ])
    const prohibited = [
      'src/lib/router/unknownRouter.ts',
      'src/lib/router/someNewFile.ts',
      'api/some-new-endpoint.ts',
      'vercel.json',
      'contracts/src/NewContract.sol',
      'contracts/script/Deploy.s.sol',
      'contracts/deployments/5042002/NewContract.json',
    ]
    for (const file of prohibited) {
      const isRouter = file.startsWith('src/lib/router/') && !file.startsWith('src/lib/router-audit/')
      const isRouterViolation = isRouter && !allowedRouterFiles.has(file)
      const isApiViolation = file.startsWith('api/') && !file.startsWith('api/_lib/')
      const isVercelViolation = file === 'vercel.json'
      const isContractsViolation = file.startsWith('contracts/src/') || file.startsWith('contracts/script/') || file.startsWith('contracts/deployments/')
      expect(isRouterViolation || isApiViolation || isVercelViolation || isContractsViolation, `${file} should be prohibited`).toBe(true)
    }
  })

    it('does not bypass the guard with nested or similarly named files', () => {
    const fakeChanged = [
      'src/lib/router/unsafe/xylonetAdapter.ts',
      'src/lib/router/nested/executionPolicy.ts',
      'src/lib/router/xylonetAdapter.ts.bak',
      'src/lib/router/executionPolicy.test.ts.old',
    ]
    const allowedRouterFiles = new Set([
      'src/lib/router/executionPolicy.ts',
      'src/lib/router/executionPolicy.test.ts',
      'src/lib/router/xylonetAdapter.ts',
      'src/lib/router/routerShadowMode.test.ts',
      'src/lib/router/xylonetAdapter.test.ts',
    ])
    const hits = fakeChanged.filter((file) => file.startsWith('src/lib/router/') && !file.startsWith('src/lib/router-audit/') && !allowedRouterFiles.has(file))
    expect(hits).toEqual(fakeChanged)
  })
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
    const changed = changedFilesAgainstBase()
    const allowedRouterFiles = new Set([
      'src/lib/router/executionPolicy.ts',
      'src/lib/router/executionPolicy.test.ts',
      'src/lib/router/xylonetAdapter.ts',
      'src/lib/router/routerShadowMode.test.ts',
      'src/lib/router/xylonetAdapter.test.ts',
      'src/lib/router/quoteState.ts',
      'src/lib/router/quoteState.test.ts',
      'src/lib/router/selectBestRoute.ts',
      'src/lib/router/synthraAdapter.ts',
      'src/lib/router/types.ts',
      'src/lib/router/synthraAdapter.test.ts',
      'src/lib/router/selectBestRoute.test.ts',
      // unitflow liquidity guard (PR #111)
      'src/lib/router/unitflowAdapter.ts',
      'src/lib/router/unitflowAdapter.test.ts',
      // contract address verification (PR #111)
      'src/lib/router/contractVerification.ts',
      'src/lib/router/contractVerification.test.ts',
      // Coco price-impact guard (Phase 2)
      'src/lib/router/cocoAdapter.ts',
      'src/lib/router/cocoAdapter.test.ts',
    ])
    expect(changed.some((file) => file.startsWith('api/'))).toBe(false)
    expect(changed.some((file) => file === 'vercel.json')).toBe(false)
    expect(changed.some((file) => file.startsWith('src/lib/router/') && !file.startsWith('src/lib/router-audit/') && !allowedRouterFiles.has(file))).toBe(false)
    expect(changed.some((file) => file.startsWith('src/features/bridge/') && !new Set([
      'src/features/bridge/amounts.ts',
      'src/features/bridge/bridge.test.ts',
      'src/features/bridge/chains.ts',
      'src/features/bridge/e2eHarness.ts',
      'src/features/bridge/errors.ts',
      'src/features/bridge/estimate.ts',
      'src/features/bridge/facade.ts',
      'src/features/bridge/index.ts',
      'src/features/bridge/params.ts',
      'src/features/bridge/params.test.ts',
      'src/features/bridge/postBridge.ts',
      'src/features/bridge/recovery.ts',
      'src/features/bridge/result.ts',
      'src/features/bridge/attempt.ts',
      'src/features/bridge/lifecycle.ts',
      'src/features/bridge/lifecycle.test.ts',
      'src/features/bridge/events.ts',
      'src/features/bridge/iris.ts',
      'src/features/bridge/explorer.ts',
      'src/features/bridge/recovery-store.test.ts',
      'docs/cctp-arc-manual-test.md',
      'docs/cctp-arc-lifecycle-recovery-manual-test.md',
      'tests/e2e/bridge-fee.spec.ts',
      'tests/e2e/bridge-lifecycle.spec.ts',
    ]).has(file))).toBe(false)
    // This PR intentionally modifies BridgePage.tsx for the CCTP fix; SwapPage stays prohibited.
    const PROHIBITED_PAGES = new Set(['src/pages/BridgePage.tsx', 'src/pages/SwapPage.tsx'])
    expect(changed.some((file) => /^src\/pages\/(?:BridgePage|SwapPage)\.tsx$/.test(file) && !PROHIBITED_PAGES.has(file))).toBe(false)
    expect(changed.some((file) => file.startsWith('contracts/src/') || file.startsWith('contracts/script/') || file.startsWith('contracts/deployments/'))).toBe(false)
  })
})
