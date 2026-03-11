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

export default function AnalyticsPage() {
  const { permissions } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!permissions.viewAnalytics) {
      router.replace("/sessions");
    }
  }, [permissions, router]);

  const summary = useOrgSummary();
  const topByDistance = useTopPerformers("distance", 10);
  const topBySessions = useTopPerformers("sessions", 10);

  if (!permissions.viewAnalytics) return null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Analytics</h2>
        <p className="text-muted-foreground">Organization-wide performance analytics.</p>
      </div>

      {summary.error && <ErrorBanner error={summary.error} />}

      {summary.isLoading ? (
        <LoadingSkeleton variant="card" />
      ) : summary.data ? (
        <SummaryCards summary={summary.data} />
      ) : null}

      <div className="grid gap-6 md:grid-cols-2">
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

        <Card>
          <CardHeader>
            <CardTitle>Top Performers by Sessions</CardTitle>
          </CardHeader>
          <CardContent>
            {topBySessions.isLoading ? (
              <LoadingSkeleton variant="card" />
            ) : topBySessions.error ? (
              <ErrorBanner error={topBySessions.error} />
            ) : (
              <TopPerformersChart data={topBySessions.data ?? []} metric="sessions" />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
