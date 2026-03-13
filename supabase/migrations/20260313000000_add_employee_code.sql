-- Add employee_code column to employees table.
-- This column exists in the live Supabase database and is used by the backend
-- to identify employees by a human-readable code.

ALTER TABLE employees
  ADD COLUMN employee_code TEXT NOT NULL DEFAULT '';

-- Remove the temporary default now that the column exists
-- (fresh deploys have no rows at migration time, so no backfill is required)
ALTER TABLE employees
  ALTER COLUMN employee_code DROP DEFAULT;

ALTER TABLE employees
  ADD CONSTRAINT employees_employee_code_unique UNIQUE (employee_code);
