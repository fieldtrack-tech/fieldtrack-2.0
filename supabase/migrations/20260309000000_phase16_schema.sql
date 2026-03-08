-- =============================================================================
-- Phase 16 — Formal Schema Migration
-- FieldTrack 2.0 Backend
-- Generated: 2026-03-09
-- =============================================================================
-- Run this migration once against your Supabase project.
-- All tables include organization_id for direct tenant filtering (enforceTenant).
-- All tables include created_at / updated_at for audit trail and debugging.
-- =============================================================================

-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =============================================================================
-- ENUM types (defined before any table that references them)
-- =============================================================================
CREATE TYPE user_role AS ENUM ('ADMIN', 'EMPLOYEE');
CREATE TYPE expense_status AS ENUM ('PENDING', 'APPROVED', 'REJECTED');
CREATE TYPE distance_job_status AS ENUM ('pending', 'processing', 'done', 'failed');

-- =============================================================================
-- organizations
-- =============================================================================
CREATE TABLE IF NOT EXISTS organizations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name            TEXT NOT NULL,
    slug            TEXT UNIQUE,                -- stable URL identifier, e.g. acme-logistics
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- users
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    email           TEXT NOT NULL UNIQUE,
    role            user_role NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_users_org ON users(organization_id);

-- =============================================================================
-- employees
-- =============================================================================
CREATE TABLE IF NOT EXISTS employees (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
    name            TEXT NOT NULL,
    phone           TEXT,
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_employees_org ON employees(organization_id);
CREATE INDEX idx_employees_user ON employees(user_id);

-- =============================================================================
-- attendance_sessions
-- =============================================================================
CREATE TABLE IF NOT EXISTS attendance_sessions (
    id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id                 UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_id                     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    checkin_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    checkout_at                     TIMESTAMPTZ,
    distance_recalculation_status   distance_job_status NOT NULL DEFAULT 'pending',
    total_distance_km               DOUBLE PRECISION,           -- km, populated after checkout
    total_duration_seconds          INTEGER,                    -- populated after checkout
    created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_org_time        ON attendance_sessions(organization_id, checkin_at); -- analytics range scans, leaderboards
CREATE INDEX idx_sessions_employee        ON attendance_sessions(employee_id);
CREATE INDEX idx_sessions_org_employee    ON attendance_sessions(organization_id, employee_id); -- employee dashboard queries
CREATE INDEX idx_sessions_requeue         ON attendance_sessions(checkout_at)
    WHERE checkout_at IS NOT NULL AND distance_recalculation_status IN ('pending'::distance_job_status, 'failed'::distance_job_status);

-- Enforce one active (unchecked-out) session per employee at the DB level.
-- The service layer already guards this; this index adds hard data integrity.
CREATE UNIQUE INDEX uniq_active_session
    ON attendance_sessions(employee_id)
    WHERE checkout_at IS NULL;

-- =============================================================================
-- gps_locations
-- =============================================================================
CREATE TABLE IF NOT EXISTS gps_locations (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id      UUID NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    latitude        DOUBLE PRECISION NOT NULL CHECK (latitude  BETWEEN -90  AND 90),
    longitude       DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    accuracy        DOUBLE PRECISION,
    recorded_at     TIMESTAMPTZ NOT NULL,
    sequence_number INTEGER,                    -- nullable now; enforce NOT NULL once ingestion is stable
    is_duplicate    BOOLEAN NOT NULL DEFAULT false,
    UNIQUE (session_id, recorded_at)    -- upsert conflict key
);

CREATE INDEX idx_locations_session_time       ON gps_locations(session_id, recorded_at);
CREATE INDEX idx_locations_session_sequence   ON gps_locations(session_id, sequence_number);
CREATE INDEX idx_locations_employee_time      ON gps_locations(employee_id, recorded_at);
CREATE INDEX idx_locations_org                ON gps_locations(organization_id);

-- =============================================================================
-- expenses
-- =============================================================================
CREATE TABLE IF NOT EXISTS expenses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_id     UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    amount          NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    description     TEXT NOT NULL,
    status          expense_status NOT NULL DEFAULT 'PENDING',
    receipt_url     TEXT,                       -- Supabase Storage URL (optional)
    submitted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    reviewed_at     TIMESTAMPTZ,
    reviewed_by     UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_expenses_org_submitted   ON expenses(organization_id, submitted_at);
CREATE INDEX idx_expenses_employee        ON expenses(employee_id);

-- =============================================================================
-- session_summaries
-- =============================================================================
CREATE TABLE IF NOT EXISTS session_summaries (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id         UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    session_id              UUID NOT NULL UNIQUE REFERENCES attendance_sessions(id) ON DELETE CASCADE,
    total_distance_km       DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_duration_seconds  INTEGER NOT NULL DEFAULT 0,
    avg_speed_kmh           DOUBLE PRECISION NOT NULL DEFAULT 0,
    computed_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_summaries_org             ON session_summaries(organization_id);
CREATE INDEX idx_summaries_session         ON session_summaries(session_id);
CREATE INDEX idx_summaries_org_computed    ON session_summaries(organization_id, computed_at);

-- =============================================================================
-- Row-Level Security (RLS) — enable on all tables
-- Supabase anon client must pass organization_id check.
-- =============================================================================
ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE users                ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees            ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_sessions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE gps_locations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses             ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_summaries    ENABLE ROW LEVEL SECURITY;

-- Service role bypasses RLS (used by background workers and crash recovery).
-- Anon/authenticated role policies are added separately per-table as needed.

-- =============================================================================
-- updated_at auto-update trigger
-- Postgres does not auto-update updated_at on UPDATE — this trigger does it.
-- =============================================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_updated_at_organizations
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_users
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_employees
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_sessions
  BEFORE UPDATE ON attendance_sessions
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_expenses
  BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TRIGGER trg_updated_at_summaries
  BEFORE UPDATE ON session_summaries
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
