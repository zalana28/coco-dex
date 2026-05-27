-- Coco DEX Analytics Schema
-- Run this migration against your Supabase database.

-- ─── Indexer State: tracks the last indexed block ───
CREATE TABLE IF NOT EXISTS indexer_state (
  id TEXT PRIMARY KEY DEFAULT 'arc_testnet',
  last_indexed_block BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO indexer_state (id, last_indexed_block)
VALUES ('arc_testnet', 0)
ON CONFLICT (id) DO NOTHING;

-- ─── DEX Events: all Swap/Mint/Burn events from the pair contract ───
CREATE TABLE IF NOT EXISTS dex_events (
  id BIGSERIAL PRIMARY KEY,
  tx_hash TEXT NOT NULL,
  log_index INTEGER NOT NULL,
  block_number BIGINT NOT NULL,
  block_timestamp TIMESTAMPTZ,
  event_type TEXT NOT NULL CHECK (event_type IN ('swap', 'mint', 'burn', 'sync')),
  wallet TEXT,
  amount0_in NUMERIC(38, 0) DEFAULT 0,
  amount1_in NUMERIC(38, 0) DEFAULT 0,
  amount0_out NUMERIC(38, 0) DEFAULT 0,
  amount1_out NUMERIC(38, 0) DEFAULT 0,
  reserve0 NUMERIC(38, 0),
  reserve1 NUMERIC(38, 0),
  volume_usd NUMERIC(18, 6) DEFAULT 0,
  fee_usd NUMERIC(18, 6) DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(tx_hash, log_index)
);

CREATE INDEX IF NOT EXISTS idx_dex_events_block ON dex_events(block_number);
CREATE INDEX IF NOT EXISTS idx_dex_events_type ON dex_events(event_type);
CREATE INDEX IF NOT EXISTS idx_dex_events_timestamp ON dex_events(block_timestamp DESC);

-- ─── Pool Snapshots: periodic TVL/reserve snapshots ───
CREATE TABLE IF NOT EXISTS pool_snapshots (
  id BIGSERIAL PRIMARY KEY,
  pool_address TEXT NOT NULL,
  block_number BIGINT NOT NULL,
  reserve_usdc NUMERIC(38, 0) NOT NULL DEFAULT 0,
  reserve_eurc NUMERIC(38, 0) NOT NULL DEFAULT 0,
  tvl_usd NUMERIC(18, 6) NOT NULL DEFAULT 0,
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pool_snapshots_time ON pool_snapshots(snapshot_at DESC);

-- ─── Daily Pool Stats: aggregated daily metrics ───
CREATE TABLE IF NOT EXISTS daily_pool_stats (
  id BIGSERIAL PRIMARY KEY,
  pool_address TEXT NOT NULL,
  day DATE NOT NULL,
  volume_usd NUMERIC(18, 6) NOT NULL DEFAULT 0,
  fees_usd NUMERIC(18, 6) NOT NULL DEFAULT 0,
  trade_count INTEGER NOT NULL DEFAULT 0,
  tvl_usd NUMERIC(18, 6) NOT NULL DEFAULT 0,
  UNIQUE(pool_address, day)
);

CREATE INDEX IF NOT EXISTS idx_daily_pool_stats_day ON daily_pool_stats(day DESC);
