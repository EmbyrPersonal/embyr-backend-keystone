-- Fixes "permission denied for table X" errors from the backend's service_role client.
-- Unchecking "Automatically expose new tables" during project creation skipped the default
-- privilege grants Supabase normally sets up alongside RLS — RLS policies only restrict rows
-- on operations you already have base table-level privilege to attempt in the first place.
-- service_role bypasses RLS but still needs these grants; authenticated needs SELECT for the
-- "select own row" policies in 001 to ever actually apply to anything.

grant usage on schema public to service_role, authenticated, anon;

grant all privileges on accounts, spark_codes, sessions to service_role;
grant select on accounts, spark_codes, sessions to authenticated;

-- service_role also needs sequence/default usage for any serial/identity columns — none of
-- our tables use those (all keys are uuid/text), so no sequence grants are needed here.
