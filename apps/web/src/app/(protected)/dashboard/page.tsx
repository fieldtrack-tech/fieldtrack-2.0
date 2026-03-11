"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrgSummary, useTopPerformers } from "@/hooks/queries/useAnalytics";
import { SummaryCards } from "@/components/charts/SummaryCards";
import { TopPerformersChart } from "@/components/charts/TopPerformersChart";
import { ErrorBanner } from "@/components/ErrorBanner";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function DashboardPage() {
  const { permissions } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!permissions.viewAnalytics) {
      router.replace("/sessions");
    }
  }, [permissions, router]);

  const summary = useOrgSummary();
  const topByDistance = useTopPerformers("distance", 10);

  if (!permissions.viewAnalytics) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Dashboard</h2>
        <p className="text-muted-foreground">Organization overview and key metrics.</p>
      </div>

      {summary.error && <ErrorBanner error={summary.error} />}

      {summary.isLoading ? (
        <LoadingSkeleton variant="card" />
      ) : summary.data ? (
        <SummaryCards summary={summary.data} />
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Top Performers by Distance</CardTitle>
        </CardHeader>
        <CardContent>
          {topByDistance.isLoading ? (
            <LoadingSkeleton variant="card" />
          ) : topByDistance.error ? (
            <ErrorBanner error={topByDistance.error} />
          ) : (
            <TopPerformersChart data={topByDistance.data ?? []} metric="distance" />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
