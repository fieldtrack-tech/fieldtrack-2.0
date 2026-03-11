"use client";

import { AlertCircle } from "lucide-react";
import { ApiError } from "@/types";

interface ErrorBannerProps {
  error: ApiError | Error | null;
}

export function ErrorBanner({ error }: ErrorBannerProps) {
  if (!error) return null;

  return (
    <div className="flex items-start gap-3 rounded-md border border-destructive/20 bg-destructive/10 p-4 text-destructive">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="flex flex-col gap-1">
        <p className="text-sm font-medium">Something went wrong</p>
        <p className="text-sm opacity-90">{error.message}</p>
        {"requestId" in error && error.requestId && (
          <p className="text-xs opacity-60">Request ID: {error.requestId}</p>
        )}
      </div>
    </div>
  );
}
