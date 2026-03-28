/**
 * query-client.ts — Global React Query client.
 *
 * Default options prevent refetch storms:
 *   - staleTime: 60s  — data is "fresh" for 1 min (per-hook overrides are more specific)
 *   - retry: 1        — one retry on network failure
 *   - refetchOnWindowFocus: false — don't hammer API on tab switch
 *
 * Global error handler fires a toast for any failed query, providing consistent
 * error visibility without each page needing its own error boundary.
 */

import { QueryClient } from "@tanstack/react-query";

function showErrorToast(message: string) {
  // Fires a custom event that the Toaster (in providers.tsx) listens to.
  // This avoids importing the toast hook here (hooks can't be used outside React).
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("fieldtrack:query-error", { detail: { message } })
    );
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Do NOT auto-toast mutations — pages handle mutation errors inline
      // (with form validation feedback, toast on onError callback, etc.)
    },
  },
});

// Wire global query error handler after client is constructed
queryClient.getQueryCache().config.onError = (error) => {
  const msg =
    error instanceof Error ? error.message : "An unexpected error occurred";
  // Suppress 401 errors — auth failures redirect to /login automatically
  if (msg.toLowerCase().includes("unauthorized")) return;
  showErrorToast(msg);
};
