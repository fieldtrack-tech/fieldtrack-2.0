"use client";

import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { useAuthContext } from "@/contexts/AuthContext";
import { UserRole } from "@/types";

export function useAuth() {
  const router = useRouter();
  const { user, session, role, permissions, isLoading } = useAuthContext();

  async function login(email: string, password: string): Promise<UserRole> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    const metaRole =
      (data.session.user.user_metadata?.role as UserRole | undefined) ??
      (data.session.user.app_metadata?.role as UserRole | undefined);
    return metaRole ?? "EMPLOYEE";
  }

  async function logout(): Promise<void> {
    await supabase.auth.signOut();
    router.push("/login");
  }

  return { user, session, role, permissions, isLoading, login, logout };
}
