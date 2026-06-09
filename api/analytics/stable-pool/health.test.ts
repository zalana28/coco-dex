import { afterEach, describe, expect, it, vi } from 'vitest'
import handler from './health'

function createMockResponse() {
  const json = vi.fn()
  const status = vi.fn(() => ({ json }))
  const setHeader = vi.fn()
  return { status, json, setHeader }
}

describe('/api/analytics/stable-pool/health', () => {
  const originalUrl = process.env.SUPABASE_URL
  const originalKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  afterEach(() => {
    process.env.SUPABASE_URL = originalUrl
    process.env.SUPABASE_SERVICE_ROLE_KEY = originalKey
  })

  it('returns not_configured when Supabase env vars are missing', async () => {
    delete process.env.SUPABASE_URL
    delete process.env.SUPABASE_SERVICE_ROLE_KEY
    const res = createMockResponse()

    await handler({} as never, res as never)

    expect(res.status).toHaveBeenCalledWith(200)
    expect(res.status.mock.results[0]?.value.json).toHaveBeenCalledWith({
      status: 'not_configured',
      reason: 'SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not configured',
    })
  })
})
