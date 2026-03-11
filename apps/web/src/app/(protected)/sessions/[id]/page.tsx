"use client";

import { useMyRoute } from "@/hooks/queries/useRoutes";
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

  const sorted = [...(locations ?? [])].sort(
    (a, b) => new Date(a.recorded_at).getTime() - new Date(b.recorded_at).getTime()
  );

  const firstLoc = sorted[0];
  const lastLoc = sorted[sorted.length - 1];

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
                {firstLoc ? formatTime(firstLoc.recorded_at) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {firstLoc ? formatDate(firstLoc.recorded_at) : ""}
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
                {lastLoc && lastLoc !== firstLoc ? formatTime(lastLoc.recorded_at) : "—"}
              </p>
              <p className="text-xs text-muted-foreground">
                {lastLoc && lastLoc !== firstLoc ? formatDate(lastLoc.recorded_at) : ""}
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
                {firstLoc && lastLoc && lastLoc !== firstLoc
                  ? formatDuration(
                      Math.floor(
                        (new Date(lastLoc.recorded_at).getTime() -
                          new Date(firstLoc.recorded_at).getTime()) /
                          1000
                      )
                    )
                  : "—"}
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

      {firstLoc && (
        <p className="text-xs text-muted-foreground">
          Approximate distance:{" "}
          {formatDistance(
            sorted.reduce((acc, loc, i) => {
              if (i === 0) return acc;
              const prev = sorted[i - 1];
              const R = 6371;
              const dLat = ((loc.latitude - prev.latitude) * Math.PI) / 180;
              const dLon = ((loc.longitude - prev.longitude) * Math.PI) / 180;
              const a =
                Math.sin(dLat / 2) ** 2 +
                Math.cos((prev.latitude * Math.PI) / 180) *
                  Math.cos((loc.latitude * Math.PI) / 180) *
                  Math.sin(dLon / 2) ** 2;
              return acc + R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            }, 0)
          )}
        </p>
      )}
    </div>
  );
}
