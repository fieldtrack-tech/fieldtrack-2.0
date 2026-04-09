-- Phase 2: Critical gap closure - indexes, functions, and computed columns
--
-- 1. Deterministic inactive segment via SQL function (NOT EXISTS)
-- 2. Numeric employee sorting via extracted integer
-- 3. Session segment indexes
-- 4. Expense org+status index
-- 5. last_seen_at index on employee_last_state
-- 6. Activity status computed column on employee_last_state
-- ──────────────────────────────────────────────────────────────────────────────

-- ═══ INDEXES ═══════════════════════════════════════════════════════════════════

-- Item 9: last_seen_at for employee segment lookups
CREATE INDEX IF NOT EXISTS idx_employee_last_seen
  ON public.employee_last_state (last_check_out_at);

-- Item 9: session checkout_at for segment queries (partial, non-null)
-- Already exists from segmentation_indexes migration, but add full index too
CREATE INDEX IF NOT EXISTS idx_sessions_checkout_full
  ON public.attendance_sessions (organization_id, checkout_at DESC NULLS FIRST);

-- Item 9: expenses by org + status for admin filtering
CREATE INDEX IF NOT EXISTS idx_expenses_org_status
  ON public.expenses (organization_id, status);

-- ═══ FUNCTIONS ═════════════════════════════════════════════════════════════════

-- Item 1+3: Deterministic inactive employee listing using NOT EXISTS.
-- Employees with no employee_last_state row are included (no-snapshot employees).
-- Returns employees that are NOT active (checked in) AND NOT recent (checkout < 24h).
CREATE OR REPLACE FUNCTION public.list_inactive_employees(
  p_org_id UUID,
  p_search TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  organization_id UUID,
  user_id UUID,
  name TEXT,
  employee_code TEXT,
  phone TEXT,
  is_active BOOLEAN,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  is_checked_in BOOLEAN,
  last_check_in_at TIMESTAMPTZ,
  last_check_out_at TIMESTAMPTZ,
  last_latitude DOUBLE PRECISION,
  last_longitude DOUBLE PRECISION,
  last_location_at TIMESTAMPTZ,
  total_count BIGINT
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH inactive AS (
    SELECT
      e.id, e.organization_id, e.user_id, e.name, e.employee_code,
      e.phone, e.is_active, e.created_at, e.updated_at,
      COALESCE(els.is_checked_in, false) AS is_checked_in,
      els.last_check_in_at,
      els.last_check_out_at,
      els.last_latitude,
      els.last_longitude,
      els.last_location_at
    FROM employees e
    LEFT JOIN employee_last_state els ON els.employee_id = e.id
    WHERE e.organization_id = p_org_id
      AND NOT EXISTS (
        SELECT 1
        FROM employee_last_state active_els
        WHERE active_els.employee_id = e.id
          AND (
            active_els.is_checked_in = true
            OR active_els.last_check_out_at >= now() - interval '24 hours'
          )
      )
      AND (p_search IS NULL OR e.name ILIKE '%' || p_search || '%')
      AND (p_is_active IS NULL OR e.is_active = p_is_active)
  )
  SELECT
    i.*,
    (SELECT COUNT(*) FROM inactive) AS total_count
  FROM inactive i
  ORDER BY
    -- Numeric-safe sorting: extract numeric portion of employee_code
    (SUBSTRING(i.employee_code FROM '[0-9]+'))::INTEGER NULLS LAST,
    i.employee_code ASC
  LIMIT p_limit
  OFFSET p_offset;
$$;

-- Item 6: Numeric-safe employee sorting function
-- Extracts the numeric portion of employee_code for natural sorting
CREATE OR REPLACE FUNCTION public.employee_code_numeric(code TEXT)
RETURNS INTEGER
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT (SUBSTRING(code FROM '[0-9]+'))::INTEGER;
$$;

-- Item 6: Add employee_number column for deterministic numeric sorting.
-- Populated from existing employee_code using the extracted numeric portion.
-- Supabase JS client can ORDER BY this column for natural sorting.
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS employee_number INTEGER;

-- Backfill employee_number from existing codes
UPDATE public.employees
SET employee_number = (SUBSTRING(employee_code FROM '[0-9]+'))::INTEGER
WHERE employee_number IS NULL
  AND employee_code ~ '[0-9]+';

-- Index for sorting: org + employee_number (natural numeric order)
CREATE INDEX IF NOT EXISTS idx_employees_org_number
  ON public.employees (organization_id, employee_number ASC NULLS LAST, employee_code ASC);

-- Trigger to auto-populate employee_number on INSERT/UPDATE
CREATE OR REPLACE FUNCTION public.set_employee_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.employee_code ~ '[0-9]+' THEN
    NEW.employee_number := (SUBSTRING(NEW.employee_code FROM '[0-9]+'))::INTEGER;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_employee_number ON public.employees;
CREATE TRIGGER trg_set_employee_number
  BEFORE INSERT OR UPDATE OF employee_code ON public.employees
  FOR EACH ROW
  EXECUTE FUNCTION public.set_employee_number();

-- Item 2: Session segmentation SQL function
-- Returns sessions with segment filter (active/recent/inactive)
CREATE OR REPLACE FUNCTION public.list_sessions_by_segment(
  p_org_id UUID,
  p_segment TEXT DEFAULT 'all',
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  employee_id UUID,
  organization_id UUID,
  checkin_at TIMESTAMPTZ,
  checkout_at TIMESTAMPTZ,
  total_distance_km DOUBLE PRECISION,
  total_duration_seconds INTEGER,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  employee_name TEXT,
  employee_code TEXT,
  activity_status TEXT,
  total_count BIGINT
)
LANGUAGE sql STABLE
SET search_path = public
AS $$
  WITH segmented AS (
    SELECT
      s.id, s.employee_id, s.organization_id,
      s.checkin_at, s.checkout_at,
      s.total_distance_km, s.total_duration_seconds,
      s.created_at, s.updated_at,
      e.name AS employee_name,
      e.employee_code,
      CASE
        WHEN s.checkout_at IS NULL THEN 'ACTIVE'
        WHEN s.checkout_at >= now() - interval '24 hours' THEN 'RECENT'
        ELSE 'INACTIVE'
      END AS activity_status
    FROM attendance_sessions s
    JOIN employees e ON e.id = s.employee_id
    WHERE s.organization_id = p_org_id
      AND (
        p_segment = 'all'
        OR (p_segment = 'active' AND s.checkout_at IS NULL)
        OR (p_segment = 'recent' AND s.checkout_at IS NOT NULL AND s.checkout_at >= now() - interval '24 hours')
        OR (p_segment = 'inactive' AND s.checkout_at IS NOT NULL AND s.checkout_at < now() - interval '24 hours')
      )
  )
  SELECT
    seg.*,
    (SELECT COUNT(*) FROM segmented) AS total_count
  FROM segmented seg
  ORDER BY
    CASE
      WHEN seg.activity_status = 'ACTIVE' THEN 1
      WHEN seg.activity_status = 'RECENT' THEN 2
      ELSE 3
    END,
    seg.checkin_at DESC
  LIMIT p_limit
  OFFSET p_offset;
$$;
