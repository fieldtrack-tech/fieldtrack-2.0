-- ============================================================================
-- Migration: Phase 25 — Webhooks & Integrations
--
-- Creates three tables:
--   webhooks            — per-org webhook registrations (url + secret + event filter)
--   webhook_events      — immutable log of every domain event emitted
--   webhook_deliveries  — delivery attempt tracking (status, retry, response)
--
-- Design notes:
--   • organization_id on every table — enforces tenant isolation at the DB layer.
--   • webhooks.secret is stored as plaintext (ideally encrypted-at-rest by Supabase
--     vault in a future phase); never returned in API responses.
--   • webhook_deliveries.status uses a check constraint for safe state transitions.
--   • Indexes target the query patterns used by the delivery worker and admin UI.
-- ============================================================================

BEGIN;

-- ─── webhooks ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhooks (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  url             TEXT        NOT NULL,
  secret          TEXT        NOT NULL,
  is_active       BOOLEAN     NOT NULL DEFAULT TRUE,
  events          TEXT[]      NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enforce HTTPS-only URLs at the database layer (defence-in-depth behind the
-- application-layer validateWebhookUrl() check).
ALTER TABLE public.webhooks
  ADD CONSTRAINT webhooks_url_https
  CHECK (url LIKE 'https://%');

-- Org lookup — used by emitEvent fan-out: WHERE org_id = $1 AND is_active = true
CREATE INDEX IF NOT EXISTS idx_webhooks_org_active
  ON public.webhooks (organization_id, is_active);

-- Trigger: keep updated_at current on every row update.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_webhooks_updated_at'
      AND tgrelid = 'public.webhooks'::regclass
  ) THEN
    CREATE TRIGGER trg_webhooks_updated_at
      BEFORE UPDATE ON public.webhooks
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END
$$;

-- ─── webhook_events ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_events (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  event_type      TEXT        NOT NULL,
  payload         JSONB       NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Delivery worker looks up the event payload by id.
CREATE INDEX IF NOT EXISTS idx_webhook_events_org_type
  ON public.webhook_events (organization_id, event_type, created_at DESC);

-- ─── webhook_deliveries ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.webhook_deliveries (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  webhook_id       UUID        NOT NULL REFERENCES public.webhooks(id) ON DELETE CASCADE,
  event_id         UUID        NOT NULL REFERENCES public.webhook_events(id) ON DELETE CASCADE,
  organization_id  UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  status           TEXT        NOT NULL DEFAULT 'pending',
  attempt_count    INTEGER     NOT NULL DEFAULT 0,
  response_status  INTEGER,
  response_body    TEXT,
  last_attempt_at  TIMESTAMPTZ,
  next_retry_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT webhook_deliveries_status_check
    CHECK (status IN ('pending', 'success', 'failed')),

  -- At-most-once delivery per (event, webhook) pair.
  -- The delivery worker uses INSERT … ON CONFLICT DO NOTHING for safe replay.
  CONSTRAINT webhook_deliveries_event_webhook_unique
    UNIQUE (event_id, webhook_id)
);

-- Admin UI query: WHERE org_id = $1 ORDER BY created_at DESC
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_org_created
  ON public.webhook_deliveries (organization_id, created_at DESC);

-- Retry worker query: WHERE status = 'pending' AND next_retry_at <= NOW()
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_pending_retry
  ON public.webhook_deliveries (status, next_retry_at)
  WHERE status = 'pending';

-- Lookup by webhook for admin drilldown
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id
  ON public.webhook_deliveries (webhook_id, created_at DESC);

COMMIT;
