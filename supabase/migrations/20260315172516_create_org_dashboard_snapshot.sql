-- Phase 24: Create org_dashboard_snapshot for O(1) dashboard reads.
--
-- The analytics worker (analytics.worker.ts) upserts into this table after
-- every session checkout. The dashboard route reads from it with a single
-- primary-key lookup instead of running 5 live aggregation queries.
--
-- Access pattern: SELECT * WHERE organization_id = $1  →  PRIMARY KEY scan.

CREATE TABLE public.org_dashboard_snapshot (
  organization_id       UUID    NOT NULL PRIMARY KEY
                                REFERENCES public.organizations(id),
  active_employee_count INT     NOT NULL DEFAULT 0,
  recent_employee_count INT     NOT NULL DEFAULT 0,
  inactive_employee_count INT   NOT NULL DEFAULT 0,
  active_employees_today INT    NOT NULL DEFAULT 0,
  today_session_count   INT     NOT NULL DEFAULT 0,
  today_distance_km     FLOAT8  NOT NULL DEFAULT 0,
  pending_expense_count INT     NOT NULL DEFAULT 0,
  pending_expense_amount NUMERIC NOT NULL DEFAULT 0,
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS consistent with org_daily_metrics and employee_latest_sessions patterns.
ALTER TABLE public.org_dashboard_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_isolation_org_dashboard_snapshot"
  ON public.org_dashboard_snapshot
  FOR ALL
  USING (
    organization_id = (
      SELECT users.organization_id FROM users WHERE users.id = auth.uid()
    )
  );

-- Seed with current data for every existing organisation so the dashboard
-- returns real numbers immediately after deploy (before any worker job runs).
-- Uses correlated subqueries to avoid cross-join inflation.
INSERT INTO public.org_dashboard_snapshot (
  organization_id, active_employee_count, recent_employee_count,
  inactive_employee_count, active_employees_today,
  today_session_count, today_distance_km,
  pending_expense_count, pending_expense_amount, updated_at
)
SELECT
  o.id,
  (SELECT COUNT(*) FROM public.employee_latest_sessions
   WHERE organization_id = o.id AND status = 'ACTIVE'),
  (SELECT COUNT(*) FROM public.employee_latest_sessions
   WHERE organization_id = o.id AND status = 'RECENT'),
  (SELECT COUNT(*) FROM public.employee_latest_sessions
   WHERE organization_id = o.id AND (status = 'INACTIVE' OR status IS NULL)),
  (SELECT COUNT(*) FROM public.employee_latest_sessions
   WHERE organization_id = o.id AND status = 'ACTIVE'),
  COALESCE(
    (SELECT total_sessions FROM public.org_daily_metrics
     WHERE organization_id = o.id AND date = CURRENT_DATE), 0),
  COALESCE(
    (SELECT total_distance_km FROM public.org_daily_metrics
     WHERE organization_id = o.id AND date = CURRENT_DATE), 0),
  (SELECT COUNT(*) FROM public.expenses
   WHERE organization_id = o.id AND status = 'PENDING'),
  COALESCE(
    (SELECT SUM(amount) FROM public.expenses
     WHERE organization_id = o.id AND status = 'PENDING'), 0),
  now()
FROM public.organizations o
ON CONFLICT (organization_id) DO NOTHING;
