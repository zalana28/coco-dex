-- Coco Native Stable Pool observability schema.
-- This keeps stable pool beta analytics separate from classic Coco V2 pair analytics.

CREATE TABLE IF NOT EXISTS stable_pool_events (
  id BIGSERIAL PRIMARY KEY,
  pool_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  event_type TEXT NOT NULL CHECK (event_type IN ('liquidity_added', 'liquidity_removed', 'swap', 'fee_updated', 'paused', 'unpaused')),
  tx_hash TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  log_index INTEGER NOT NULL,
  block_timestamp TIMESTAMPTZ,
  token0_address TEXT NOT NULL,
  token1_address TEXT NOT NULL,
  reserve0_raw NUMERIC(38, 0),
  reserve1_raw NUMERIC(38, 0),
  lp_total_supply_raw NUMERIC(38, 0),
  lp_decimals INTEGER,
  provider TEXT,
  recipient TEXT,
  token_in TEXT,
  token_out TEXT,
  amount0_raw NUMERIC(38, 0),
  amount1_raw NUMERIC(38, 0),
  lp_amount_raw NUMERIC(38, 0),
  amount_in_raw NUMERIC(38, 0),
  amount_out_raw NUMERIC(38, 0),
  fee_amount_raw NUMERIC(38, 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_stable_pool_events_pool_block ON stable_pool_events(pool_address, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_stable_pool_events_type ON stable_pool_events(event_type);
CREATE INDEX IF NOT EXISTS idx_stable_pool_events_timestamp ON stable_pool_events(block_timestamp DESC);

CREATE TABLE IF NOT EXISTS stable_pool_reserve_snapshots (
  id BIGSERIAL PRIMARY KEY,
  pool_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  snapshot_type TEXT NOT NULL DEFAULT 'reserve',
  block_number BIGINT NOT NULL,
  block_timestamp TIMESTAMPTZ,
  token0_address TEXT NOT NULL,
  token1_address TEXT NOT NULL,
  reserve0_raw NUMERIC(38, 0) NOT NULL DEFAULT 0,
  reserve1_raw NUMERIC(38, 0) NOT NULL DEFAULT 0,
  lp_total_supply_raw NUMERIC(38, 0),
  lp_decimals INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stable_pool_reserve_snapshots_pool_block ON stable_pool_reserve_snapshots(pool_address, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_stable_pool_reserve_snapshots_created ON stable_pool_reserve_snapshots(created_at DESC);

CREATE TABLE IF NOT EXISTS stable_pool_lp_snapshots (
  id BIGSERIAL PRIMARY KEY,
  pool_address TEXT NOT NULL,
  chain_id INTEGER NOT NULL,
  snapshot_type TEXT NOT NULL DEFAULT 'lp_supply',
  block_number BIGINT NOT NULL,
  block_timestamp TIMESTAMPTZ,
  lp_token_address TEXT NOT NULL,
  lp_total_supply_raw NUMERIC(38, 0) NOT NULL DEFAULT 0,
  lp_decimals INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stable_pool_lp_snapshots_pool_block ON stable_pool_lp_snapshots(pool_address, block_number DESC);
CREATE INDEX IF NOT EXISTS idx_stable_pool_lp_snapshots_created ON stable_pool_lp_snapshots(created_at DESC);

CREATE TABLE IF NOT EXISTS stable_pool_indexer_runs (
  id BIGSERIAL PRIMARY KEY,
  chain_id INTEGER NOT NULL,
  pool_address TEXT NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('started', 'success', 'failed', 'not_configured')),
  from_block BIGINT,
  to_block BIGINT,
  events_indexed INTEGER NOT NULL DEFAULT 0,
  snapshots_written INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stable_pool_indexer_runs_pool_started ON stable_pool_indexer_runs(pool_address, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_stable_pool_indexer_runs_status ON stable_pool_indexer_runs(status);
