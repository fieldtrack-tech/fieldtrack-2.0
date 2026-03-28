import type { Session } from "@supabase/supabase-js";
import { UserRole } from "@/types";

function toUserRole(value: unknown): UserRole | undefined {
  return value === "ADMIN" || value === "EMPLOYEE" ? value : undefined;
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");

  if (typeof atob === "function") {
    return atob(padded);
  }

  // Next.js middleware runs in an edge-like runtime where atob exists.
  // This fallback keeps the helper usable in Node-based contexts too.
  const nodeBuffer = (globalThis as { Buffer?: { from: (data: string, enc: string) => { toString: (enc: string) => string } } }).Buffer;
  if (!nodeBuffer) {
    throw new Error("No base64 decoder available in current runtime");
  }
  return nodeBuffer.from(padded, "base64").toString("utf-8");
}

export function extractRoleFromAccessToken(accessToken: string | null | undefined): UserRole | undefined {
  if (!accessToken) return undefined;

  try {
    const parts = accessToken.split(".");
    if (parts.length < 2) return undefined;
    const payload = JSON.parse(decodeBase64Url(parts[1])) as Record<string, unknown>;
    return toUserRole(payload.role);
  } catch {
    return undefined;
  }
}

export function extractRoleFromSession(
  session: Session,
  options: { allowUserMetadataFallback?: boolean } = {}
): UserRole {
  const claimRole = extractRoleFromAccessToken(session.access_token);
  if (claimRole) return claimRole;

  const appMetaRole = toUserRole((session.user.app_metadata as Record<string, unknown> | undefined)?.role);
  if (appMetaRole) return appMetaRole;

  if (options.allowUserMetadataFallback) {
    const userMetaRole = toUserRole((session.user.user_metadata as Record<string, unknown> | undefined)?.role);
    if (userMetaRole) return userMetaRole;
  }

  return "EMPLOYEE";
}
