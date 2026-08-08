import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see .env.example). ' +
      'This client uses the service_role key and must never run in a browser/client context.'
  );
}

// Service-role client: bypasses RLS. Every write to accounts/spark_codes/sessions goes
// through this — clients never get write access, see the RLS note in 001_init_keystone.sql.
export const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Anon-key client — used for exactly one thing: triggering Supabase Auth's own
// resetPasswordForEmail flow, which is a public auth action and doesn't need (and shouldn't
// use) the service_role key. Never used for anything else in this backend.
if (!anonKey) {
  throw new Error('SUPABASE_ANON_KEY must be set (see .env.example) for password reset requests.');
}
export const supabaseAnon = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
