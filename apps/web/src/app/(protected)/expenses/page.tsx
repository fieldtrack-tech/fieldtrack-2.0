"use client";

import { useState } from "react";
import { useMyExpenses } from "@/hooks/queries/useExpenses";
import { ExpensesTable } from "@/components/tables/ExpensesTable";
import { ErrorBanner } from "@/components/ErrorBanner";

const PAGE_LIMIT = 20;

export default function ExpensesPage() {
  const [page, setPage] = useState(1);
  const { data, isLoading, error } = useMyExpenses(page, PAGE_LIMIT);

  const expenses = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const hasMore = page * PAGE_LIMIT < total;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">My Expenses</h2>
        <p className="text-muted-foreground">Your submitted expense claims.</p>
      </div>

      {error && <ErrorBanner error={error} />}

      <ExpensesTable
        expenses={expenses}
        showActions={false}
        isLoading={isLoading}
        page={page}
        hasMore={hasMore}
        onPageChange={setPage}
      />
    </div>
  );
}
