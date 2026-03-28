-- Migration: add_admin_audit_log
-- Creates an immutable audit trail for admin actions (DLQ replays, circuit
-- breaker events, etc.).  Written via the service client so no RLS is needed;
-- API-layer auth already restricts who can read or trigger logged events.

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  event           TEXT         NOT NULL,
  actor_id        UUID,
  organization_id UUID,
  resource_type   TEXT,
  resource_id     TEXT,
  payload         JSONB        NOT NULL DEFAULT '{}'::jsonb,
  created_at      TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- Descending created_at first so page queries (before=<ts>) stay fast.
CREATE INDEX IF NOT EXISTS idx_admin_audit_log_org_created
  ON public.admin_audit_log (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_admin_audit_log_event_created
  ON public.admin_audit_log (event, created_at DESC);

COMMENT ON TABLE public.admin_audit_log IS
  'Immutable audit trail of privileged admin actions (DLQ replays, circuit breaker state changes, etc.)';
