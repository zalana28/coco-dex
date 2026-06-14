-- Migration 003: add unique constraint on pool_snapshots to prevent duplicate entries.
-- The indexer inserts a snapshot on every cron run; without this constraint the table
-- grows unboundedly and old duplicate rows waste storage and slow queries.
--
-- Strategy: deduplicate existing rows first, then add the constraint.

-- Step 1: remove duplicate pool_snapshots, keeping the latest row per (pool_address, block_number)
DELETE FROM pool_snapshots
WHERE id NOT IN (
  SELECT DISTINCT ON (pool_address, block_number) id
  FROM pool_snapshots
  ORDER BY pool_address, block_number, snapshot_at DESC
);

-- Step 2: add the unique constraint
ALTER TABLE pool_snapshots
  ADD CONSTRAINT uq_pool_snapshots_pool_block UNIQUE (pool_address, block_number);
