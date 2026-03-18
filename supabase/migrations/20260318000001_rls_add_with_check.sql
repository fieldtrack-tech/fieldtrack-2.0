-- ============================================================
-- Add WITH CHECK clauses to all write-capable RLS policies
--
-- The original policies used USING() only. For FOR ALL policies,
-- USING() governs SELECT/DELETE row visibility but INSERT/UPDATE
-- rows are not filtered at the DB level without WITH CHECK.
--
-- This migration drops and recreates each FOR ALL policy with an
-- identical WITH CHECK clause, enforcing org isolation on writes
-- as a defense-in-depth measure (primary isolation is enforced at
-- the application layer via orgTable() + service role, but the
-- last line of defense must also be correct).
--
-- els_employee_self is FOR SELECT only — no WITH CHECK needed.
-- ============================================================

-- ── organizations ────────────────────────────────────────────
DROP POLICY IF EXISTS "org_isolation_organizations" ON public.organizations;
CREATE POLICY "org_isolation_organizations"
  ON public.organizations FOR ALL
  USING      (id = (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (id = (SELECT organization_id FROM public.users WHERE id = auth.uid()));

-- ── users ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_isolation_users" ON public.users;
CREATE POLICY "org_isolation_users"
  ON public.users FOR ALL
  USING      (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()));

-- ── employees ────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_isolation_employees" ON public.employees;
CREATE POLICY "org_isolation_employees"
  ON public.employees FOR ALL
  USING      (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()));

-- ── attendance_sessions ──────────────────────────────────────
DROP POLICY IF EXISTS "org_isolation_attendance_sessions" ON public.attendance_sessions;
CREATE POLICY "org_isolation_attendance_sessions"
  ON public.attendance_sessions FOR ALL
  USING      (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()));

-- ── gps_locations ────────────────────────────────────────────
DROP POLICY IF EXISTS "org_isolation_gps_locations" ON public.gps_locations;
CREATE POLICY "org_isolation_gps_locations"
  ON public.gps_locations FOR ALL
  USING      (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()));

-- ── expenses ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "org_isolation_expenses" ON public.expenses;
CREATE POLICY "org_isolation_expenses"
  ON public.expenses FOR ALL
  USING      (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()));

-- ── session_summaries ────────────────────────────────────────
DROP POLICY IF EXISTS "org_isolation_session_summaries" ON public.session_summaries;
CREATE POLICY "org_isolation_session_summaries"
  ON public.session_summaries FOR ALL
  USING      (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()));

-- ── admin_sessions ───────────────────────────────────────────
DROP POLICY IF EXISTS "org_isolation_admin_sessions" ON public.admin_sessions;
CREATE POLICY "org_isolation_admin_sessions"
  ON public.admin_sessions FOR ALL
  USING      (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()));

-- ── employee_daily_metrics ───────────────────────────────────
DROP POLICY IF EXISTS "org_isolation_employee_daily_metrics" ON public.employee_daily_metrics;
CREATE POLICY "org_isolation_employee_daily_metrics"
  ON public.employee_daily_metrics FOR ALL
  USING      (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()));

-- ── org_daily_metrics ────────────────────────────────────────
DROP POLICY IF EXISTS "org_isolation_org_daily_metrics" ON public.org_daily_metrics;
CREATE POLICY "org_isolation_org_daily_metrics"
  ON public.org_daily_metrics FOR ALL
  USING      (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()));

-- ── employee_latest_sessions (admin: FOR ALL) ────────────────
DROP POLICY IF EXISTS "els_admin_all" ON public.employee_latest_sessions;
CREATE POLICY "els_admin_all"
  ON public.employee_latest_sessions FOR ALL
  USING      (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()))
  WITH CHECK (organization_id = (SELECT organization_id FROM public.users WHERE id = auth.uid()));

-- Note: els_employee_self is FOR SELECT only — WITH CHECK is not applicable.
