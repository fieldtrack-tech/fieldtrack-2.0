-- Create admin_sessions table.
-- This table tracks live monitoring sessions started by admin users.
-- Must be created before the partial unique index in 20260312000000_one_active_monitoring_session.sql.

CREATE TABLE admin_sessions (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID        NOT NULL REFERENCES users(id),
  organization_id UUID        NOT NULL REFERENCES organizations(id),
  started_at      TIMESTAMPTZ NOT NULL,
  ended_at        TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Tenant isolation index
CREATE INDEX admin_sessions_organization_id_idx
  ON admin_sessions (organization_id);

-- Foreign key index
CREATE INDEX admin_sessions_admin_id_idx
  ON admin_sessions (admin_id);

-- Enable RLS (backend uses service role key which bypasses RLS;
-- enabling RLS ensures anon/authenticated roles have no implicit access)
ALTER TABLE admin_sessions ENABLE ROW LEVEL SECURITY;
