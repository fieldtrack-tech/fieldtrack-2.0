"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Session, User, AuthChangeEvent } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";
import { derivePermissions } from "@/lib/permissions";
import { extractRoleFromSession } from "@/lib/auth/role";
import { UserRole, UserPermissions } from "@/types";

interface AuthContextValue {
  user: User | null;
  session: Session | null;
  role: UserRole | null;
  permissions: UserPermissions;
  isLoading: boolean;
}

const defaultPermissions: UserPermissions = {
  viewSessions: false,
  viewLocations: false,
  viewExpenses: false,
  viewAnalytics: false,
  viewOrgSessions: false,
  viewOrgExpenses: false,
  manageExpenses: false,
};

const AuthContext = createContext<AuthContextValue>({
  user: null,
  session: null,
  role: null,
  permissions: defaultPermissions,
  isLoading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<UserRole | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions>(defaultPermissions);
  const [isLoading, setIsLoading] = useState(true);

  function extractRole(s: Session): UserRole {
    return extractRoleFromSession(s, { allowUserMetadataFallback: true });
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session: s } }: { data: { session: Session | null } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s) {
        const r = extractRole(s);
        setRole(r);
        setPermissions(derivePermissions(r));
      }
      setIsLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event: AuthChangeEvent, s: Session | null) => {
      setSession(s);
      setUser(s?.user ?? null);
      if (s) {
        const r = extractRole(s);
        setRole(r);
        setPermissions(derivePermissions(r));
      } else {
        setRole(null);
        setPermissions(defaultPermissions);
      }
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, session, role, permissions, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuthContext(): AuthContextValue {
  return useContext(AuthContext);
}
