import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/004_indexer_reliability.sql'), 'utf8')

describe('indexer reliability migration', () => {
  it('provides database-backed overlap protection restricted to service_role', () => {
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS indexer_locks')
    expect(migration).toContain('CREATE OR REPLACE FUNCTION acquire_indexer_lock')
    expect(migration).toContain('ON CONFLICT (lock_name) DO UPDATE')
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION acquire_indexer_lock')
    expect(migration).toContain('TO service_role')
    expect(migration).toContain('REVOKE ALL ON TABLE indexer_locks FROM PUBLIC, anon, authenticated')
  })

  it('persists idempotent events and cursor in one transaction', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION persist_indexer_chunk')
    expect(migration).toContain('ON CONFLICT (tx_hash, log_index) DO NOTHING')
    expect(migration).toMatch(/INSERT INTO dex_events[\s\S]*UPDATE indexer_state/)
    expect(migration).toMatch(/persist_indexer_chunk\([\s\S]*p_lock_token UUID/)
    expect(migration).toMatch(/FROM indexer_locks[\s\S]*lock_token = p_lock_token[\s\S]*expires_at > NOW\(\)/)
  })
})
