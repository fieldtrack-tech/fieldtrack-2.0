"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { AppLayout } from "@/components/layout/AppLayout";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const { session, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !session) {
      router.replace("/login");
    }
  }, [session, isLoading, router]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="w-full max-w-4xl p-8">
          <LoadingSkeleton variant="card" />
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return <AppLayout>{children}</AppLayout>;
}
