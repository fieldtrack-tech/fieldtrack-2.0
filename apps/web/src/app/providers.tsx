"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/components/providers/theme-provider";
import { Toaster } from "@/components/ui/toaster";
import { useToast } from "@/components/ui/use-toast";
import { validateEnv } from "@/lib/env";
import { useEffect } from "react";

function EnvValidator({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    console.log("[FieldTrack] API mode:", {
      base: process.env.NEXT_PUBLIC_API_BASE_URL ?? "(not set)",
      proxy: process.env.API_DESTINATION_URL ?? "(not set — only relevant in proxy mode)",
    });

    try {
      validateEnv();
    } catch (e) {
      console.error(e);
    }
  }, []);

  return <>{children}</>;
}

/**
 * GlobalErrorToast — listens for `fieldtrack:query-error` events emitted by
 * the query-client.ts error handler and shows a toast notification.
 */
function GlobalErrorToast() {
  const { toast } = useToast();

  useEffect(() => {
    function handler(e: Event) {
      const detail = (e as CustomEvent<{ message: string }>).detail;
      toast({
        variant: "destructive",
        title: "Something went wrong",
        description: detail.message ?? "An unexpected error occurred.",
      });
    }
    window.addEventListener("fieldtrack:query-error", handler);
    return () => window.removeEventListener("fieldtrack:query-error", handler);
  }, [toast]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <EnvValidator>
            {children}
            <GlobalErrorToast />
            <Toaster />
          </EnvValidator>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
