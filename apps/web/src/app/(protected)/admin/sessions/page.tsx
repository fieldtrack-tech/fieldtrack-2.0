"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrgSessions } from "@/hooks/queries/useSessions";
import { SessionsTable } from "@/components/tables/SessionsTable";
import { ErrorBanner } from "@/components/ErrorBanner";

const PAGE_LIMIT = 20;

export default function AdminSessionsPage() {
  const { permissions } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!permissions.viewOrgSessions) {
      router.replace("/sessions");
    }
  }, [permissions, router]);

  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useOrgSessions(page, PAGE_LIMIT);

  const sessions = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const hasMore = page * PAGE_LIMIT < total;

  if (!permissions.viewOrgSessions) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">All Sessions</h2>
        <p className="text-muted-foreground">Organization-wide attendance sessions.</p>
      </div>

      {error && <ErrorBanner error={error} />}

      <SessionsTable
        sessions={sessions}
        isLoading={isLoading}
        page={page}
        hasMore={hasMore}
        onPageChange={setPage}
      />
    </div>
  );
}
