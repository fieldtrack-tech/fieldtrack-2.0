-- ============================================================================
-- Migration: Fix webhooks — add missing updated_at column
--
-- Root cause:
--   The baseline schema (00000000000000) created public.webhooks WITHOUT an
--   updated_at column (comment noted "webhooks are replaced, not updated").
--   The subsequent Phase 25 migration (20260326000200) used CREATE TABLE IF
--   NOT EXISTS, which is a no-op when the table already exists, so updated_at
--   was never added to the live table.
--   The backend repository selects updated_at in every query, causing:
--     ERROR: column webhooks.updated_at does not exist → HTTP 500
--
-- What this migration does:
--   1. Adds updated_at TIMESTAMPTZ to public.webhooks (idempotent).
--   2. Back-fills existing rows so updated_at = created_at (safe default).
--   3. Drops the NOT NULL constraint temporarily to allow the back-fill,
--      then re-applies it.
--   4. Creates / replaces the set_updated_at trigger function.
--   5. Attaches the BEFORE UPDATE trigger (idempotent via existence check).
--   6. Ensures the webhooks_url_https CHECK constraint exists (idempotent).
--
-- Idempotency: every step is guarded with IF NOT EXISTS / OR REPLACE / EXISTS
-- checks — safe to run on any environment, including ones where Phase 25 may
-- have partially succeeded.
-- ============================================================================

BEGIN;

-- ── 1. Add updated_at column if it does not already exist ────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   information_schema.columns
    WHERE  table_schema = 'public'
      AND  table_name   = 'webhooks'
      AND  column_name  = 'updated_at'
  ) THEN
    -- Add as nullable first so back-fill can run without violating NOT NULL.
    ALTER TABLE public.webhooks
      ADD COLUMN updated_at TIMESTAMPTZ;

    -- Back-fill: use created_at as a sensible default for pre-existing rows.
    UPDATE public.webhooks
    SET    updated_at = created_at
    WHERE  updated_at IS NULL;

    -- Now enforce NOT NULL (all rows have a value after the back-fill).
    ALTER TABLE public.webhooks
      ALTER COLUMN updated_at SET NOT NULL;

    -- Apply the DEFAULT for future inserts.
    ALTER TABLE public.webhooks
      ALTER COLUMN updated_at SET DEFAULT NOW();
  END IF;
END
$$;

-- ── 2. Create / replace the set_updated_at trigger function ──────────────────
--      Using CREATE OR REPLACE is fully idempotent.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- ── 3. Attach the BEFORE UPDATE trigger (idempotent existence check) ─────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_trigger
    WHERE  tgname   = 'trg_webhooks_updated_at'
      AND  tgrelid  = 'public.webhooks'::regclass
  ) THEN
    CREATE TRIGGER trg_webhooks_updated_at
      BEFORE UPDATE ON public.webhooks
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;

-- ── 4. Ensure webhooks_url_https CHECK constraint exists (idempotent) ────────
--      Phase 25 added this via a bare ALTER TABLE ADD CONSTRAINT (no IF NOT
--      EXISTS). Guard with an existence check to keep this migration re-runnable.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM   pg_constraint
    WHERE  conname   = 'webhooks_url_https'
      AND  conrelid  = 'public.webhooks'::regclass
  ) THEN
    ALTER TABLE public.webhooks
      ADD CONSTRAINT webhooks_url_https
      CHECK (url LIKE 'https://%');
  END IF;
END
$$;

COMMIT;
