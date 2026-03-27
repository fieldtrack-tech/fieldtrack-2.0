-- ============================================================================
-- Migration: Fix webhook delivery pipeline (Phase 25 completion)
--
-- Root cause:
--   Phase 25 migration (20260326000200) was recorded in the history table as
--   "applied" but was NEVER executed against the live database.  The live DB
--   was built by 48 older remote migrations that used different column names.
--   Consequence: every attempt to insert a webhook delivery row fails silently,
--   so BullMQ jobs are never enqueued and webhook_deliveries stays empty.
--
-- Specific schema mismatches (live DB vs code expectations):
--
--   webhook_events:
--     • table does not exist → webhook_events insert logs an error but fan-out
--       still proceeds; the worker then cannot fetch the event payload and marks
--       the delivery failed immediately.
--
--   webhook_deliveries (code uses → live DB has):
--     • attempt_count      → attempts       (column name mismatch → insert/update error)
--     • last_attempt_at    → delivered_at   (column name mismatch → update error)
--     • (not provided)     → event_type NOT NULL  (no DEFAULT → insert rejected)
--     • (not provided)     → payload JSONB NOT NULL (no DEFAULT → insert rejected)
--
-- What this migration does (all steps are idempotent):
--   1. Create webhook_events with RLS (service-role only).
--   2. Drop NOT NULL from webhook_deliveries.event_type (nullable going forward).
--   3. Drop NOT NULL from webhook_deliveries.payload (nullable going forward).
--   4. Rename attempts → attempt_count.
--   5. Drop NOT NULL + DEFAULT from delivered_at, then rename → last_attempt_at.
--      Adds the column fresh if neither name exists.
--   6. Add attempt_count column if neither attempts nor attempt_count exists.
--   7. Add Phase 25 indexes for delivery query patterns.
--
-- Safety:
--   • webhook_deliveries is confirmed empty — column renames carry no data risk.
--   • All steps guarded with existence checks — safe to run more than once.
--   • No existing data is dropped or modified.
--   • RLS is not disabled on any table.
-- ============================================================================

BEGIN;

-- ─── 1. Create webhook_events ─────────────────────────────────────────────────
--
-- Stores an immutable record of every domain event, keyed by the event
-- envelope UUID.  The delivery worker fetches the payload by event_id to
-- build and sign the HTTP request body.

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  payload         JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable RLS — service-role only (consistent with webhook_deliveries policy).
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename   = 'webhook_events'
      AND policyname  = 'service_role_only_webhook_events'
  ) THEN
    CREATE POLICY "service_role_only_webhook_events"
      ON public.webhook_events
      TO service_role
      USING (true)
      WITH CHECK (true);
  END IF;
END
$$;

-- Delivery worker lookup: SELECT payload FROM webhook_events WHERE id = $1
-- Org + type index supports admin audit queries.
CREATE INDEX IF NOT EXISTS idx_webhook_events_org_type
  ON public.webhook_events (organization_id, event_type, created_at DESC);

-- ─── 2. Fix webhook_deliveries — drop NOT NULL from legacy columns ─────────────
--
-- The live table was created with event_type and payload as NOT NULL.
-- The backend never supplies these in insert payloads (Phase 25 schema
-- removed them from webhook_deliveries entirely).  Making them nullable
-- unblocks all delivery inserts without changing existing data.

DO $$
BEGIN
  -- event_type: make nullable if it is currently NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'webhook_deliveries'
      AND column_name  = 'event_type'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.webhook_deliveries ALTER COLUMN event_type DROP NOT NULL;
  END IF;
END
$$;

DO $$
BEGIN
  -- payload: make nullable if it is currently NOT NULL
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'webhook_deliveries'
      AND column_name  = 'payload'
      AND is_nullable  = 'NO'
  ) THEN
    ALTER TABLE public.webhook_deliveries ALTER COLUMN payload DROP NOT NULL;
  END IF;
END
$$;

-- ─── 3. Rename attempts → attempt_count ───────────────────────────────────────
--
-- Live DB: attempts INT NOT NULL DEFAULT 0
-- Code expects: attempt_count (used in every INSERT and UPDATE)

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'webhook_deliveries'
      AND column_name  = 'attempts'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'webhook_deliveries'
        AND column_name  = 'attempt_count'
    ) THEN
      ALTER TABLE public.webhook_deliveries RENAME COLUMN attempts TO attempt_count;
    END IF;
  END IF;
END
$$;

-- ─── 4. Handle delivered_at → last_attempt_at ─────────────────────────────────
--
-- Live DB: delivered_at TIMESTAMPTZ NOT NULL DEFAULT now()
-- Code expects: last_attempt_at TIMESTAMPTZ (nullable, no default)
--   - INSERT does not set this field (only set on actual delivery attempt)
--   - UPDATE sets it when processing succeeds or fails

-- Drop the old index that references `delivered_at` (idempotent).
DROP INDEX IF EXISTS public.idx_webhook_deliveries_org_delivered_at;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'webhook_deliveries'
      AND column_name  = 'delivered_at'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name   = 'webhook_deliveries'
        AND column_name  = 'last_attempt_at'
    ) THEN
      -- Remove NOT NULL so the column is nullable going forward
      ALTER TABLE public.webhook_deliveries
        ALTER COLUMN delivered_at DROP NOT NULL;
      -- Remove the DEFAULT now() — last_attempt_at should be NULL until first attempt
      ALTER TABLE public.webhook_deliveries
        ALTER COLUMN delivered_at DROP DEFAULT;
      -- Rename
      ALTER TABLE public.webhook_deliveries
        RENAME COLUMN delivered_at TO last_attempt_at;
    END IF;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'webhook_deliveries'
      AND column_name  = 'last_attempt_at'
  ) THEN
    -- Neither name exists — add the column fresh
    ALTER TABLE public.webhook_deliveries
      ADD COLUMN last_attempt_at TIMESTAMPTZ;
  END IF;
END
$$;

-- ─── 5. Ensure attempt_count column exists ────────────────────────────────────
--
-- Guards the edge case where neither `attempts` nor `attempt_count` existed.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'webhook_deliveries'
      AND column_name  = 'attempt_count'
  ) THEN
    ALTER TABLE public.webhook_deliveries
      ADD COLUMN attempt_count INTEGER NOT NULL DEFAULT 0;
  END IF;
END
$$;

-- ─── 6. Add Phase 25 delivery indexes ────────────────────────────────────────

-- Admin UI: list deliveries for org, newest first
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org_created
  ON public.webhook_deliveries (organization_id, created_at DESC);

-- Retry worker: find pending deliveries whose next_retry_at has elapsed
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending_retry
  ON public.webhook_deliveries (status, next_retry_at)
  WHERE status = 'pending';

-- Admin drilldown: show all deliveries for a specific webhook
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id
  ON public.webhook_deliveries (webhook_id, created_at DESC);

COMMIT;
