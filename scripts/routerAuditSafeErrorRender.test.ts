import { inspect } from 'node:util'
import { describe, expect, it } from 'vitest'
import {
  PublicAuditError,
  publicAuditError,
  safeErrorMarkdown,
  safeErrorCliText,
  summarizeCauseChain,
} from '../src/lib/router-audit/safeError'

const secrets = ['user:password', 'SUPER_SECRET', 'Bearer SUPER_SECRET', '/Users/example/private-project', 'https://rpc.example.com/path']

function expectSanitized(rendered: string) {
  for (const secret of secrets) expect(rendered).not.toContain(secret)
  expect(rendered).not.toContain('https://rpc.example.com/path')
  expect(rendered).not.toMatch(/\/(?:Users|home)\//)
}

describe('safe error rendering paths', () => {
  it('never leaks secrets through String/stack/inspect/JSON/Markdown/CLI', () => {
    const source = (() => {
      const root = new Error('root https://user:password@example.com') as Error & { cause?: unknown }
      const nested = {
        message: 'https://rpc.example.com/path?apiKey=SUPER_SECRET',
        reason: 'Authorization: Bearer SUPER_SECRET',
        localPath: '/Users/example/private-project',
        cause: root,
      }
      root.cause = nested
      return root
    })()
    const error = publicAuditError('RPC failed for https://rpc.example.com/path?apiKey=SUPER_SECRET', source, {
      category: 'transport', operation: 'eth_getCode', providerId: 'fixture-provider', code: 'TRANSIENT_RPC', retryable: true,
    })
    expect('cause' in error).toBe(false)
    const outputs = [String(error), error.stack ?? '', inspect(error, { depth: 12 }), JSON.stringify(error), safeErrorMarkdown(error), safeErrorCliText(error)]
    for (const output of outputs) expectSanitized(output)
  })

  it('embeds a sanitized cyclic cause chain and never retains the original object', () => {
    const root: { message: string; cause?: unknown } = { message: 'Authorization: Bearer SUPER_SECRET' }
    let current = root
    for (let i = 0; i < 3; i += 1) {
      const next = { message: `level-${i}`, cause: current }
      current = next
    }
    root.cause = current
    const reasons = summarizeCauseChain(root)
    expect(reasons).toContain('[CYCLIC_CAUSE]')
    expectSanitized(reasons.join('\n'))
  })

  it('renders a PublicAuditError without throwing and without cause', () => {
    const error = new PublicAuditError('safe outer', { category: 'report', operation: 'x', retryable: false, reasons: ['boom https://user:password@example.com'] })
    expect(error).toBeInstanceOf(PublicAuditError)
    expect('cause' in error).toBe(false)
    expectSanitized(error.message)
    expectSanitized(safeErrorMarkdown(error))
  })
})
