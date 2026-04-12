-- P3-1: Drop duplicate GPS index
--
-- Both idx_locations_session_time and idx_gps_locations_session_recorded_at
-- index the same columns: (session_id, recorded_at) on gps_locations.
-- The later, more explicitly named idx_gps_locations_session_recorded_at is kept.
-- Dropping the duplicate halves the per-insert write cost on the largest table
-- (307k+ rows and growing).
--
-- Safe to run with concurrent writes — DROP INDEX on a non-unique index
-- does not lock the table in Postgres 14+.

DROP INDEX IF EXISTS public.idx_locations_session_time;
