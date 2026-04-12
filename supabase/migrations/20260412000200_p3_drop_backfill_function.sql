-- P3-4: Remove backfill_feat1_snapshots function
--
-- This function was a one-time data backfill added in migration
-- 20260329000200_feat1_snapshot_tables.sql. It has already been executed
-- (SELECT public.backfill_feat1_snapshots() runs in that migration) and
-- has no ongoing callers in the codebase. Removing it reduces noise in
-- the pg_proc catalog and prevents accidental re-execution.
--
-- The rollback migration (20260329000200_feat1_rollback.sql) already
-- has a corresponding DROP, so this is consistent with the rollback contract.

DROP FUNCTION IF EXISTS public.backfill_feat1_snapshots();
