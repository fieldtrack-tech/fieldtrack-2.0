-- Migration: persist circuit-breaker state on the webhooks table.
--
-- Problem: failure_streak and disabled_until are currently Redis-only.
-- A Redis restart or eviction loses all in-flight streak data, allowing a
-- misbehaving endpoint to reset its consecutive-failure count for free.
--
-- Solution:
--   failure_streak   INT    — mirrors cb:failure_streak:{id} in Redis
--   circuit_open_until  TIMESTAMPTZ NULL — set when circuit is OPEN,
--                         NULL when CLOSED/HALF-OPEN
--
-- The application layer treats DB as the authoritative source of truth on
-- cold-start; Redis is the hot-path cache.  On each process start, a sync
-- function reads all webhooks with circuit_open_until IS NOT NULL and
-- re-populates the Redis cooldown key so delivery workers respect open
-- circuits even after a Redis flush.

ALTER TABLE public.webhooks
  ADD COLUMN IF NOT EXISTS failure_streak      INT         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS circuit_open_until  TIMESTAMPTZ;

-- Index so the startup sync query can find open circuits quickly.
CREATE INDEX IF NOT EXISTS idx_webhooks_circuit_open
  ON public.webhooks (circuit_open_until)
  WHERE circuit_open_until IS NOT NULL;

COMMENT ON COLUMN public.webhooks.failure_streak IS
  'Consecutive delivery failures (Redis-mirrored). Resets on any successful delivery.';

COMMENT ON COLUMN public.webhooks.circuit_open_until IS
  'When non-NULL the circuit is OPEN and no deliveries are attempted until this timestamp.';
