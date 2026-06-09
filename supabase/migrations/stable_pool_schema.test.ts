import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('stable pool observability schema', () => {
  it('keeps stable pool analytics separated from classic V2 dex_events', () => {
    const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/002_stable_pool_observability.sql'), 'utf8')

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS stable_pool_events')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS stable_pool_reserve_snapshots')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS stable_pool_lp_snapshots')
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS stable_pool_indexer_runs')
    expect(migration).not.toMatch(/ALTER\s+TABLE\s+dex_events/i)
    expect(migration).not.toMatch(/INSERT\s+INTO\s+dex_events/i)
  })
})
