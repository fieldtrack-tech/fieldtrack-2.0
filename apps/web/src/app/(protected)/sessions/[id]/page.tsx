"use client";

import { useMyRoute } from "@/hooks/queries/useRoutes";
import { useMySession } from "@/hooks/queries/useSessions";
import { RouteMap } from "@/components/maps/RouteMap";
import { ErrorBanner } from "@/components/ErrorBanner";
import { LoadingSkeleton } from "@/components/LoadingSkeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate, formatTime, formatDistance, formatDuration } from "@/lib/utils";

interface SessionDetailPageProps {
  params: { id: string };
}

export default function SessionDetailPage({ params }: SessionDetailPageProps) {
  const { id } = params;
  const { data: locations, isLoading, error } = useMyRoute(id);
  const { data: session } = useMySession(id);

  const sorted = [...(locations ?? [])].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );

  // Use session record fields as authoritative source for times/duration.
  // Fall back to GPS point timestamps only if no session is in cache.
  const checkinAt = session?.checkin_at ?? sorted[0]?.recorded_at ?? null;
  const checkoutAt = session?.checkout_at ?? (sorted.length > 1 ? sorted[sorted.length - 1].recorded_at : null);
  const durationSeconds = session?.total_duration_seconds ?? null;
  const distanceKm = session?.total_distance_km ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Session Detail</h2>
        <p className="text-muted-foreground text-sm font-mono">{id}</p>
      </div>

      {error && <ErrorBanner error={error} />}

      {isLoading ? (
        <LoadingSkeleton variant="card" />
      ) : (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Check-in
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">
                {checkinAt ? formatTime(checkinAt) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {checkinAt ? formatDate(checkinAt) : ""}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Check-out
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">
                {checkoutAt ? formatTime(checkoutAt) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {checkoutAt ? formatDate(checkoutAt) : ""}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                GPS Points
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">{sorted.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Duration
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-lg font-semibold">
                {durationSeconds != null ? formatDuration(durationSeconds) : "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Route Map</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <LoadingSkeleton variant="map" />
          ) : (
            <RouteMap locations={locations ?? []} />
          )}
        </CardContent>
      </Card>

      {distanceKm != null && (
        <p className="text-xs text-muted-foreground">
          Approximate distance: {formatDistance(distanceKm)}
        </p>
      )}
    </div>
  );
}
