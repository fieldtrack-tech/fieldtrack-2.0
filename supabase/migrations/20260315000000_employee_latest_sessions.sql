-- ─────────────────────────────────────────────────────────────────────────────
-- Migration: employee_latest_sessions snapshot table
--
-- Stores one row per (organization_id, employee_id) containing the data from
-- that employee's most recent attendance session.  Allows the admin sessions
-- endpoint to return one row per employee in O(employees) instead of scanning
-- the full attendance_sessions table with a window function.
--
-- Write maintenance:
--   ‣ Check-in  → upsert via upsert_employee_latest_session()
--   ‣ Check-out → upsert via upsert_employee_latest_session()
--   ‣ Distance recalculation → UPDATE distance/duration columns directly
-- ─────────────────────────────────────────────────────────────────────────────

-- ─── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS employee_latest_sessions (
    organization_id              UUID        NOT NULL,
    employee_id                  UUID        NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    session_id                   UUID        REFERENCES attendance_sessions(id) ON DELETE SET NULL,
    checkin_at                   TIMESTAMPTZ NOT NULL,
    checkout_at                  TIMESTAMPTZ,
    total_distance_km            DOUBLE PRECISION,
    total_duration_seconds       INTEGER,
    distance_recalculation_status TEXT       NOT NULL DEFAULT 'pending',
    employee_code                TEXT,
    employee_name                TEXT,
    -- activity status: ACTIVE | RECENT | INACTIVE
    status                       TEXT        NOT NULL DEFAULT 'ACTIVE'
        CHECK (status IN ('ACTIVE', 'RECENT', 'INACTIVE')),
    -- integer priority for fast ORDER BY without a CASE expression
    status_priority              INTEGER     NOT NULL DEFAULT 1
        CHECK (status_priority IN (1, 2, 3)),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (organization_id, employee_id)
);

-- ─── Indexes ─────────────────────────────────────────────────────────────────

-- Primary read path: org-scoped, sorted by status then recency
CREATE INDEX IF NOT EXISTS idx_emp_latest_org_status
    ON employee_latest_sessions (organization_id, status_priority, updated_at DESC);

-- Lookup by session_id (used during distance recalculation update)
CREATE INDEX IF NOT EXISTS idx_emp_latest_session
    ON employee_latest_sessions (session_id);

-- ─── Upsert helper function ───────────────────────────────────────────────────
--
-- Called from the application on every check-in and check-out.
-- Derives status and status_priority from checkout_at so the application
-- never has to re-implement that logic.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION upsert_employee_latest_session(
    p_session_id                  UUID,
    p_organization_id             UUID,
    p_employee_id                 UUID,
    p_checkin_at                  TIMESTAMPTZ,
    p_checkout_at                 TIMESTAMPTZ      DEFAULT NULL,
    p_total_distance_km           DOUBLE PRECISION DEFAULT NULL,
    p_total_duration_seconds      INTEGER          DEFAULT NULL,
    p_distance_recalculation_status TEXT           DEFAULT 'pending'
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_emp_code     TEXT;
    v_emp_name     TEXT;
    v_status       TEXT;
    v_priority     INTEGER;
BEGIN
    -- Resolve employee display fields from the employees table
    SELECT employee_code, name
      INTO v_emp_code, v_emp_name
      FROM employees
     WHERE id = p_employee_id;

    -- Derive activity status
    v_status := CASE
        WHEN p_checkout_at IS NULL                                    THEN 'ACTIVE'
        WHEN p_checkout_at > NOW() - INTERVAL '24 hours'             THEN 'RECENT'
        ELSE 'INACTIVE'
    END;

    v_priority := CASE v_status
        WHEN 'ACTIVE'   THEN 1
        WHEN 'RECENT'   THEN 2
        ELSE                 3
    END;

    INSERT INTO employee_latest_sessions (
        organization_id,
        employee_id,
        session_id,
        checkin_at,
        checkout_at,
        total_distance_km,
        total_duration_seconds,
        distance_recalculation_status,
        employee_code,
        employee_name,
        status,
        status_priority,
        updated_at
    ) VALUES (
        p_organization_id,
        p_employee_id,
        p_session_id,
        p_checkin_at,
        p_checkout_at,
        p_total_distance_km,
        p_total_duration_seconds,
        p_distance_recalculation_status,
        v_emp_code,
        v_emp_name,
        v_status,
        v_priority,
        NOW()
    )
    ON CONFLICT (organization_id, employee_id) DO UPDATE SET
        session_id                    = EXCLUDED.session_id,
        checkin_at                    = EXCLUDED.checkin_at,
        checkout_at                   = EXCLUDED.checkout_at,
        total_distance_km             = EXCLUDED.total_distance_km,
        total_duration_seconds        = EXCLUDED.total_duration_seconds,
        distance_recalculation_status = EXCLUDED.distance_recalculation_status,
        employee_code                 = EXCLUDED.employee_code,
        employee_name                 = EXCLUDED.employee_name,
        status                        = EXCLUDED.status,
        status_priority               = EXCLUDED.status_priority,
        updated_at                    = EXCLUDED.updated_at;
END;
$$;

-- ─── Permissions ─────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON employee_latest_sessions TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION upsert_employee_latest_session TO authenticated, service_role;

-- ─── Backfill from existing data ─────────────────────────────────────────────
--
-- Populate the snapshot table with the latest session per employee using
-- DISTINCT ON.  This is a one-time seed; ongoing maintenance is via the
-- application upsert path.
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO employee_latest_sessions (
    organization_id,
    employee_id,
    session_id,
    checkin_at,
    checkout_at,
    total_distance_km,
    total_duration_seconds,
    distance_recalculation_status,
    employee_code,
    employee_name,
    status,
    status_priority,
    updated_at
)
SELECT DISTINCT ON (s.organization_id, s.employee_id)
    s.organization_id,
    s.employee_id,
    s.id                                                            AS session_id,
    s.checkin_at,
    s.checkout_at,
    s.total_distance_km,
    s.total_duration_seconds,
    s.distance_recalculation_status::TEXT,
    e.employee_code,
    e.name                                                          AS employee_name,
    CASE
        WHEN s.checkout_at IS NULL                                  THEN 'ACTIVE'
        WHEN s.checkout_at > NOW() - INTERVAL '24 hours'           THEN 'RECENT'
        ELSE 'INACTIVE'
    END                                                             AS status,
    CASE
        WHEN s.checkout_at IS NULL                                  THEN 1
        WHEN s.checkout_at > NOW() - INTERVAL '24 hours'           THEN 2
        ELSE 3
    END                                                             AS status_priority,
    NOW()                                                           AS updated_at
FROM attendance_sessions s
JOIN employees e ON e.id = s.employee_id
ORDER BY s.organization_id, s.employee_id, s.checkin_at DESC
ON CONFLICT (organization_id, employee_id) DO NOTHING;
