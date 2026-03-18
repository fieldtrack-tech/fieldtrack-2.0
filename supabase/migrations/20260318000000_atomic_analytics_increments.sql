-- ============================================================
-- Atomic analytics increment functions
--
-- Replaces the read-then-upsert pattern in analytics.metrics.repository.ts
-- with a single atomic INSERT ... ON CONFLICT DO UPDATE using DB-side
-- arithmetic.  Eliminates the TOCTOU race condition under concurrent
-- checkouts for the same (employee_id, date).
--
-- Functions are SECURITY DEFINER so callers do not need table-level grants.
-- EXECUTE is revoked from PUBLIC and granted only to service_role (the role
-- used by supabaseServiceClient on the backend).
-- ============================================================

-- ── increment_employee_session_metrics ───────────────────────────────────────
-- Called by the distance worker after session distance/duration is computed.
-- Atomically increments sessions by 1 and adds the given distance + duration.
-- Leaves expenses_count and expenses_amount at their current values.

CREATE OR REPLACE FUNCTION public.increment_employee_session_metrics(
  p_organization_id UUID,
  p_employee_id     UUID,
  p_date            DATE,
  p_distance_km     FLOAT8,
  p_duration_seconds INT
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO employee_daily_metrics (
    organization_id, employee_id, date,
    sessions, distance_km, duration_seconds
  )
  VALUES (
    p_organization_id, p_employee_id, p_date,
    1, p_distance_km, p_duration_seconds
  )
  ON CONFLICT (employee_id, date) DO UPDATE SET
    sessions         = employee_daily_metrics.sessions + 1,
    distance_km      = ROUND(
                         (employee_daily_metrics.distance_km + EXCLUDED.distance_km)::numeric,
                         3
                       )::float8,
    duration_seconds = employee_daily_metrics.duration_seconds + EXCLUDED.duration_seconds,
    updated_at       = now();
$$;

-- ── increment_org_session_metrics ────────────────────────────────────────────
-- Called alongside increment_employee_session_metrics after session completion.
-- Atomically increments total_sessions by 1 and adds distance + duration.

CREATE OR REPLACE FUNCTION public.increment_org_session_metrics(
  p_organization_id UUID,
  p_date            DATE,
  p_distance_km     FLOAT8,
  p_duration_seconds INT
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO org_daily_metrics (
    organization_id, date,
    total_sessions, total_distance_km, total_duration_seconds
  )
  VALUES (
    p_organization_id, p_date,
    1, p_distance_km, p_duration_seconds
  )
  ON CONFLICT (organization_id, date) DO UPDATE SET
    total_sessions         = org_daily_metrics.total_sessions + 1,
    total_distance_km      = ROUND(
                               (org_daily_metrics.total_distance_km + EXCLUDED.total_distance_km)::numeric,
                               3
                             )::float8,
    total_duration_seconds = org_daily_metrics.total_duration_seconds + EXCLUDED.total_duration_seconds,
    updated_at             = now();
$$;

-- ── increment_employee_expense_metrics ───────────────────────────────────────
-- Called after a new expense is created.
-- Atomically increments expenses_count by 1 and adds the expense amount.
-- Leaves sessions, distance_km, and duration_seconds at their current values.
-- amount uses NUMERIC arithmetic to preserve exact currency precision.

CREATE OR REPLACE FUNCTION public.increment_employee_expense_metrics(
  p_organization_id UUID,
  p_employee_id     UUID,
  p_date            DATE,
  p_amount          NUMERIC
) RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO employee_daily_metrics (
    organization_id, employee_id, date,
    expenses_count, expenses_amount
  )
  VALUES (
    p_organization_id, p_employee_id, p_date,
    1, p_amount
  )
  ON CONFLICT (employee_id, date) DO UPDATE SET
    expenses_count  = employee_daily_metrics.expenses_count + 1,
    expenses_amount = employee_daily_metrics.expenses_amount + EXCLUDED.expenses_amount,
    updated_at      = now();
$$;

-- ── Permissions ───────────────────────────────────────────────────────────────
-- Revoke public access; only the service_role (backend) may call these functions.

REVOKE EXECUTE ON FUNCTION public.increment_employee_session_metrics(UUID, UUID, DATE, FLOAT8, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_org_session_metrics(UUID, DATE, FLOAT8, INT) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_employee_expense_metrics(UUID, UUID, DATE, NUMERIC) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.increment_employee_session_metrics(UUID, UUID, DATE, FLOAT8, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_org_session_metrics(UUID, DATE, FLOAT8, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_employee_expense_metrics(UUID, UUID, DATE, NUMERIC) TO service_role;
