-- ============================================================
-- FieldTrack 2.0 — Employee Code Auto-Generator (Phase 9)
--
-- Provides a helper RPC function so the API can obtain the next
-- employee code from the sequence without raw SQL execution.
-- ============================================================

-- Function callable by the service role (no auth.users dependency)
CREATE OR REPLACE FUNCTION public.generate_employee_code(prefix TEXT DEFAULT 'EMP')
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT prefix || LPAD(nextval('public.employee_code_seq')::TEXT, 4, '0');
$$;

GRANT EXECUTE ON FUNCTION public.generate_employee_code(TEXT) TO service_role;
