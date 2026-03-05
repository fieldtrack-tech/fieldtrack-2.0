import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * Phase 10: Supabase client separation.
 *
 * supabaseAnonClient — uses the ANON key. RLS is enforced by default.
 * Used in all normal request handlers. enforceTenant() still applied
 * for defense-in-depth tenant isolation beyond RLS.
 *
 * supabaseServiceClient — uses the SERVICE ROLE key. Bypasses RLS.
 * Reserved ONLY for:
 *  - Crash recovery bootstrap scan (reads across all tenants)
 *  - Background worker writes (no user JWT available)
 *  - Internal system reconciliation
 * MUST NOT be used inside the normal HTTP request lifecycle.
 */
export const supabaseAnonClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_ANON_KEY,
);

export const supabaseServiceClient = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
);
