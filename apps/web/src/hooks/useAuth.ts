"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/contexts/AuthContext";
import { extractRoleFromSession } from "@/lib/auth/role";
import { clearAuthTokenCache } from "@/lib/api/client";
import { UserRole } from "@/types";
import { queryClient } from "@/lib/query-client";

export function useAuth() {
  const router = useRouter();
  const { user, session, role, permissions, isLoading } = useAuthContext();

  async function login(email: string, password: string): Promise<UserRole> {
    // Prevent stale bearer reuse when switching users (e.g. employee -> admin).
    clearAuthTokenCache();
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    return extractRoleFromSession(data.session, { allowUserMetadataFallback: true });
  }

  async function logout(): Promise<void> {
    clearAuthTokenCache();
    await supabase.auth.signOut();
    queryClient.clear();
    router.push("/login");
  }

  return { user, session, role, permissions, isLoading, login, logout };
}
