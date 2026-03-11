"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";

export default function RootPage() {
  const { session, permissions, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (isLoading) return;

    if (!session) {
      router.replace("/login");
      return;
    }

    if (permissions.viewAnalytics) {
      router.replace("/dashboard");
    } else {
      router.replace("/sessions");
    }
  }, [session, permissions, isLoading, router]);

  return null;
}
