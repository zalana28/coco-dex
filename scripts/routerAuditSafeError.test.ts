import { inspect } from 'node:util'
import { describe, expect, it, vi } from 'vitest'
import {
  PublicAuditError,
  publicAuditError,
  safeErrorCliText,
  safeErrorMarkdown,
  summarizeCauseChain,
} from '../src/lib/router-audit/safeError'

const secrets = [
  'user:password',
  'SUPER_SECRET',
  'Bearer SUPER_SECRET',
  '/Users/example/private-project',
]

function expectSanitized(rendered: string) {
  for (const secret of secrets) expect(rendered).not.toContain(secret)
  expect(rendered).not.toContain('https://rpc.example.com/path')
}

function hostileCause() {
  const root = new Error('root https://user:password@example.com') as Error & { cause?: unknown }
  const nested = {
    message: 'https://rpc.example.com/path?apiKey=SUPER_SECRET',
    reason: 'Authorization: Bearer SUPER_SECRET',
    localPath: '/Users/example/private-project',
    cause: root,
  }
  root.cause = nested
  return root
}

describe('public router audit errors', () => {
  it('sanitizes nested and cyclic causes without retaining the original object', () => {
    const source = hostileCause()
    const error = publicAuditError('RPC failed for https://rpc.example.com/path?apiKey=SUPER_SECRET', source, {
      category: 'transport',
      operation: 'eth_getCode',
      providerId: 'fixture-provider',
      code: 'TRANSIENT_RPC',
      retryable: true,
    })
    expect(error).toBeInstanceOf(PublicAuditError)
    expect('cause' in error).toBe(false)
    expect(Object.values(error)).not.toContain(source)
    expect(error.metadata.reasons).toContain('[CYCLIC_CAUSE]')

    const outputs = [
      String(error),
      error.stack ?? '',
      inspect(error, { depth: 10 }),
      JSON.stringify(error),
      safeErrorMarkdown(error),
      safeErrorCliText(error),
    ]
    for (const output of outputs) expectSanitized(output)
  })

  it('handles plain-object and string causes and caps cause depth', () => {
    let cause: unknown = 'Authorization: Bearer SUPER_SECRET'
    for (let index = 0; index < 20; index += 1) cause = { message: `level-${index}`, cause }
    const reasons = summarizeCauseChain(cause)
    expect(reasons.length).toBeLessThanOrEqual(5)
    expectSanitized(reasons.join('\n'))
  })

  it('does not leak through console.error-style inspection', () => {
    const error = publicAuditError('safe outer', hostileCause(), {
      category: 'rpc', operation: 'eth_call', retryable: false,
    })
    const logger = vi.fn((value: unknown) => inspect(value, { depth: 10 }))
    const rendered = logger(error)
    expectSanitized(rendered)
  })
})
