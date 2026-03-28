-- Migration: webhook DLQ archival and retention support.
--
-- DLQ entries currently accumulate indefinitely in BullMQ (Redis).
-- When a job ages out of the retention window, the application archives
-- a snapshot to this table before removing the BullMQ job.  This gives
-- operators a permanent, queryable history without unbounded Redis growth.
--
-- Schema is intentionally write-once (no updates, no deletes) so the
-- table acts as an immutable audit trail.

CREATE TABLE IF NOT EXISTS public.webhook_dlq_archive (
  id              UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  delivery_id     TEXT         NOT NULL,
  webhook_id      TEXT         NOT NULL,
  event_id        TEXT         NOT NULL,
  url             TEXT         NOT NULL,
  attempt_number  INT          NOT NULL,
  failed_at       TIMESTAMPTZ  NOT NULL,
  archived_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  reason          TEXT         NOT NULL DEFAULT 'retention_policy'
);

CREATE INDEX IF NOT EXISTS idx_dlq_archive_webhook_id
  ON public.webhook_dlq_archive (webhook_id, archived_at DESC);

CREATE INDEX IF NOT EXISTS idx_dlq_archive_archived_at
  ON public.webhook_dlq_archive (archived_at DESC);

COMMENT ON TABLE public.webhook_dlq_archive IS
  'Immutable archive of DLQ jobs removed by the retention policy or manually purged.';
