-- Bounded indexer checkpointing and database-backed overlap protection.
-- Apply after 001_analytics_schema.sql and 003_pool_snapshots_unique.sql.

CREATE TABLE IF NOT EXISTS indexer_locks (
  lock_name TEXT PRIMARY KEY,
  lock_token UUID NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DELETE FROM stable_pool_reserve_snapshots
WHERE id NOT IN (
  SELECT DISTINCT ON (pool_address, chain_id, block_number) id
  FROM stable_pool_reserve_snapshots
  ORDER BY pool_address, chain_id, block_number, created_at DESC
);
DELETE FROM stable_pool_lp_snapshots
WHERE id NOT IN (
  SELECT DISTINCT ON (pool_address, chain_id, block_number) id
  FROM stable_pool_lp_snapshots
  ORDER BY pool_address, chain_id, block_number, created_at DESC
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_stable_reserve_snapshot_block
  ON stable_pool_reserve_snapshots(pool_address, chain_id, block_number);
CREATE UNIQUE INDEX IF NOT EXISTS uq_stable_lp_snapshot_block
  ON stable_pool_lp_snapshots(pool_address, chain_id, block_number);

CREATE OR REPLACE FUNCTION acquire_indexer_lock(
  p_lock_name TEXT,
  p_lock_token UUID,
  p_ttl_seconds INTEGER DEFAULT 600
) RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  acquired_token UUID;
BEGIN
  IF p_ttl_seconds < 1 OR p_ttl_seconds > 3600 THEN
    RAISE EXCEPTION 'invalid lock ttl';
  END IF;

  INSERT INTO indexer_locks (lock_name, lock_token, expires_at, updated_at)
  VALUES (p_lock_name, p_lock_token, NOW() + make_interval(secs => p_ttl_seconds), NOW())
  ON CONFLICT (lock_name) DO UPDATE
    SET lock_token = EXCLUDED.lock_token,
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    WHERE indexer_locks.expires_at <= NOW()
  RETURNING lock_token INTO acquired_token;

  RETURN COALESCE(acquired_token = p_lock_token, FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION release_indexer_lock(
  p_lock_name TEXT,
  p_lock_token UUID
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM indexer_locks
  WHERE lock_name = p_lock_name AND lock_token = p_lock_token;
END;
$$;

-- Inserts events idempotently and advances the cursor in the same transaction.
-- If any event or snapshot write fails, PostgreSQL rolls back the cursor update.
CREATE OR REPLACE FUNCTION persist_indexer_chunk(
  p_lock_name TEXT,
  p_lock_token UUID,
  p_state_id TEXT,
  p_events JSONB,
  p_last_indexed_block BIGINT,
  p_snapshot JSONB DEFAULT NULL
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_count INTEGER := 0;
  current_cursor BIGINT;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM indexer_locks
    WHERE lock_name = p_lock_name
      AND lock_token = p_lock_token
      AND expires_at > NOW()
    FOR UPDATE
  ) THEN
    RAISE EXCEPTION 'indexer lock is not owned or has expired';
  END IF;

  SELECT last_indexed_block INTO current_cursor
  FROM indexer_state
  WHERE id = p_state_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'indexer state row not found';
  END IF;
  IF p_last_indexed_block < current_cursor THEN
    RAISE EXCEPTION 'cursor cannot move backwards';
  END IF;

  IF jsonb_typeof(COALESCE(p_events, '[]'::jsonb)) <> 'array' THEN
    RAISE EXCEPTION 'events must be a JSON array';
  END IF;

  INSERT INTO dex_events (
    tx_hash, log_index, block_number, block_timestamp, event_type, wallet,
    amount0_in, amount1_in, amount0_out, amount1_out, reserve0, reserve1,
    volume_usd, fee_usd
  )
  SELECT
    event.tx_hash, event.log_index, event.block_number, event.block_timestamp,
    event.event_type, event.wallet, event.amount0_in, event.amount1_in,
    event.amount0_out, event.amount1_out, event.reserve0, event.reserve1,
    event.volume_usd, event.fee_usd
  FROM jsonb_to_recordset(COALESCE(p_events, '[]'::jsonb)) AS event(
    tx_hash TEXT, log_index INTEGER, block_number BIGINT,
    block_timestamp TIMESTAMPTZ, event_type TEXT, wallet TEXT,
    amount0_in NUMERIC, amount1_in NUMERIC, amount0_out NUMERIC,
    amount1_out NUMERIC, reserve0 NUMERIC, reserve1 NUMERIC,
    volume_usd NUMERIC, fee_usd NUMERIC
  )
  ON CONFLICT (tx_hash, log_index) DO NOTHING;
  GET DIAGNOSTICS inserted_count = ROW_COUNT;

  IF p_snapshot IS NOT NULL THEN
    INSERT INTO pool_snapshots (
      pool_address, block_number, reserve_usdc, reserve_eurc, tvl_usd, snapshot_at
    ) VALUES (
      p_snapshot->>'pool_address',
      (p_snapshot->>'block_number')::BIGINT,
      (p_snapshot->>'reserve_usdc')::NUMERIC,
      (p_snapshot->>'reserve_eurc')::NUMERIC,
      (p_snapshot->>'tvl_usd')::NUMERIC,
      (p_snapshot->>'snapshot_at')::TIMESTAMPTZ
    )
    ON CONFLICT (pool_address, block_number) DO NOTHING;
  END IF;

  UPDATE indexer_state
  SET last_indexed_block = p_last_indexed_block, updated_at = NOW()
  WHERE id = p_state_id;

  RETURN inserted_count;
END;
$$;

REVOKE ALL ON FUNCTION acquire_indexer_lock(TEXT, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION release_indexer_lock(TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON TABLE indexer_locks FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE indexer_locks TO service_role;
REVOKE ALL ON FUNCTION persist_indexer_chunk(TEXT, UUID, TEXT, JSONB, BIGINT, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION acquire_indexer_lock(TEXT, UUID, INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION release_indexer_lock(TEXT, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION persist_indexer_chunk(TEXT, UUID, TEXT, JSONB, BIGINT, JSONB) TO service_role;
