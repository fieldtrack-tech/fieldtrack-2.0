"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/toaster";
import { validateEnv } from "@/lib/env";
import { useEffect } from "react";

function EnvValidator({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    try {
      validateEnv();
    } catch (e) {
      console.error(e);
    }
  }, []);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <EnvValidator>
          {children}
          <Toaster />
        </EnvValidator>
      </AuthProvider>
    </QueryClientProvider>
  );
}
