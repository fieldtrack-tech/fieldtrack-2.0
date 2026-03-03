import { createClient } from "@supabase/supabase-js";
import { env } from "./env.js";

/**
 * Supabase client initialized with the service role key.
 * This bypasses RLS and gives full access — use only on the backend.
 * All queries MUST go through enforceTenant() for tenant isolation.
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
