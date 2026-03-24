import jwksClient from "jwks-rsa";
import jwt from "jsonwebtoken";
import type { JwtPayload as JoseJwtPayload } from "jsonwebtoken";
import { env } from "../config/env.js";

const { verify } = jwt;

/**
 * JWKS client for fetching Supabase signing keys.
 * 
 * Supabase signs JWTs using ES256 (asymmetric) and rotates keys periodically.
 * This client fetches the public keys from Supabase's JWKS endpoint and caches them.
 * 
 * Phase 20: Authentication Layer Fix
 */
const client = jwksClient({
  jwksUri: `${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`,
  cache: true,
  cacheMaxEntries: 5,
  cacheMaxAge: 600000, // 10 minutes
});

/**
 * Fetches the signing key for a given JWT.
 * Called automatically by jsonwebtoken during verification.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getKey = (header: any, callback: any): void => {
  client.getSigningKey((header as Record<string, string>).kid, (err, key) => {
    if (err) {
      callback(err);
      return;
    }
    const signingKey = key?.getPublicKey();
    callback(null, signingKey);
  });
};

/**
 * Supabase JWT payload structure.
 *
 * IMPORTANT — claim ownership:
 *   app_metadata  — written by the Supabase service role / custom_access_token_hook only.
 *                   Users cannot modify it. Use this for authorization-sensitive values.
 *   user_metadata — user-controlled via supabase.auth.updateUser(). Never use for authz.
 *
 * The application role (ADMIN / EMPLOYEE) is embedded in app_metadata by the
 * custom_access_token_hook which reads the authoritative value from public.users.role.
 */
export interface SupabaseJwtPayload extends JoseJwtPayload {
  sub: string;
  email?: string;
  aud?: string; // Token audience — must be "authenticated" for user tokens
  role?: string; // Supabase built-in claim — always "authenticated", NOT the app role
  app_metadata?: {
    provider?: string;
    organization_id?: string; // embedded by custom_access_token_hook
    employee_id?: string;     // embedded by custom_access_token_hook
    role?: string;            // application role: ADMIN or EMPLOYEE (server-controlled)
  };
  user_metadata?: {
    [key: string]: unknown;   // user-controlled — do NOT use for authorization decisions
  };
}

/**
 * Layer 1 — Token Verification
 * 
 * Verifies a Supabase JWT token using JWKS.
 * 
 * Responsibilities:
 * - Verify JWT signature using Supabase's public keys
 * - Validate token structure and claims
 * - Return decoded payload
 * 
 * Does NOT:
 * - Load user data from database
 * - Attach anything to request
 * - Handle HTTP responses
 * 
 * This separation allows reuse in:
 * - Background workers
 * - Internal API calls
 * - Admin tools
 * - WebSocket authentication
 * 
 * @param token - The JWT token to verify
 * @returns Decoded and verified payload
 * @throws Error if token is invalid or verification fails
 */
export async function verifySupabaseToken(
  token: string
): Promise<SupabaseJwtPayload> {
  return new Promise((resolve, reject) => {
    verify(
      token,
      getKey,
      {
        algorithms: ["ES256"], // Supabase uses ES256
        audience: "authenticated", // Only accept user tokens
        issuer: `${env.SUPABASE_URL}/auth/v1`,
      },
      (err, decoded) => {
        if (err) {
          reject(err);
          return;
        }
        
        const payload = decoded as SupabaseJwtPayload;
        
        // Production safety check: validate audience
        // Supabase issues different token types (service_role, anon, authenticated)
        // Only allow authenticated user tokens
        if (payload.aud !== "authenticated") {
          reject(new Error(`Invalid token audience: ${payload.aud}`));
          return;
        }
        
        resolve(payload);
      }
    );
  });
}
