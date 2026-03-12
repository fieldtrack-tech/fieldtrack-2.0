-- Prevent more than one active monitoring session per admin at a time.
-- A "partial unique index" only indexes rows where ended_at IS NULL,
-- so historical (ended) sessions are unaffected.
CREATE UNIQUE INDEX one_active_monitoring_session
  ON admin_sessions (admin_id)
  WHERE ended_at IS NULL;
