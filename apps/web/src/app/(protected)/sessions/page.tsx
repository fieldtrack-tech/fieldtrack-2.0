"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useMySessions } from "@/hooks/queries/useSessions";
import { SessionsTable } from "@/components/tables/SessionsTable";
import { ErrorBanner } from "@/components/ErrorBanner";

const PAGE_LIMIT = 20;

export default function SessionsPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useMySessions(page, PAGE_LIMIT);

  const sessions = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const hasMore = page * PAGE_LIMIT < total;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">My Sessions</h2>
        <p className="text-muted-foreground">Your attendance and field sessions.</p>
      </div>

      {error && <ErrorBanner error={error} />}

      <SessionsTable
        sessions={sessions}
        isLoading={isLoading}
        onRowClick={(id) => router.push(`/sessions/${id}`)}
        page={page}
        hasMore={hasMore}
        onPageChange={setPage}
      />
    </div>
  );
}
