"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useAdminMap } from "@/hooks/queries/useDashboard";
import { ErrorBanner } from "@/components/ErrorBanner";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MapPin, RefreshCw, Users, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { EmployeeMapMarker } from "@/types";

// ─── Dynamic Leaflet import (SSR disabled — Leaflet uses `window`) ────────────

const EmployeeMap = dynamic(() => import("./EmployeeMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center rounded-b-lg bg-muted text-sm text-muted-foreground">
      Loading map…
    </div>
  ),
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STATUS_DOT: Record<EmployeeMapMarker["status"], string> = {
  ACTIVE:   "bg-emerald-500",
  RECENT:   "bg-orange-400",
  INACTIVE: "bg-slate-400",
};

const STATUS_LABEL: Record<EmployeeMapMarker["status"], string> = {
  ACTIVE:   "Active",
  RECENT:   "Recent",
  INACTIVE: "Inactive",
};

// ─── Employee List Item ────────────────────────────────────────────────────────

function EmployeeListItem({
  marker,
  selected,
  onClick,
}: {
  marker: EmployeeMapMarker;
  selected: boolean;
  onClick: () => void;
}) {
  const initials = marker.employeeName
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0] ?? "")
    .join("")
    .toUpperCase();

  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
        selected
          ? "bg-primary/10 text-primary"
          : "hover:bg-accent/60 text-foreground"
      )}
    >
      <div
        className={cn(
          "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-bold",
          selected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
        )}
      >
        {initials}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium leading-none">
          {marker.employeeName}
        </p>
        {marker.employeeCode && (
          <p className="text-[11px] text-muted-foreground mt-0.5">{marker.employeeCode}</p>
        )}
      </div>
      <span
        className={cn(
          "flex h-2 w-2 shrink-0 rounded-full",
          STATUS_DOT[marker.status],
          marker.status === "ACTIVE" && "animate-pulse"
        )}
      />
    </button>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function MonitoringMapPage() {
  const { permissions } = useAuth();
  const router = useRouter();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!permissions.viewAnalytics) {
      router.replace("/sessions");
    }
  }, [permissions, router]);

  const { data: markers = [], isLoading, error, dataUpdatedAt, refetch } = useAdminMap();

  if (!permissions.viewAnalytics) return null;

  const activeCount   = markers.filter((m) => m.status === "ACTIVE").length;
  const recentCount   = markers.filter((m) => m.status === "RECENT").length;
  const inactiveCount = markers.filter((m) => m.status === "INACTIVE").length;

  const filtered = markers.filter((m) =>
    search
      ? m.employeeName.toLowerCase().includes(search.toLowerCase()) ||
        (m.employeeCode ?? "").toLowerCase().includes(search.toLowerCase())
      : true
  );

  function handleSelect(id: string) {
    setSelectedId((prev) => (prev === id ? null : id));
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Live Employee Map</h1>
          <p className="text-sm text-muted-foreground">
            Showing latest GPS position per employee. Refreshes every 30 s.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dataUpdatedAt ? (
            <span className="text-xs text-muted-foreground">
              Updated {new Date(dataUpdatedAt).toLocaleTimeString()}
            </span>
          ) : null}
          <button
            onClick={() => void refetch()}
            className="flex items-center gap-1.5 rounded-lg border border-border/60 px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground transition-colors"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh
          </button>
        </div>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        <Badge className="gap-1.5 bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {activeCount} Active
        </Badge>
        <Badge variant="secondary" className="gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
          {recentCount} Recent
        </Badge>
        <Badge variant="outline" className="gap-1.5">
          <MapPin className="h-3 w-3" />
          {markers.length} on map
        </Badge>
      </div>

      {/* Error */}
      {error ? <ErrorBanner error={error as Error} /> : null}

      {/* Main content: map + employee list */}
      <div className="grid grid-cols-1 xl:grid-cols-[1fr_280px] gap-4">
        {/* Map */}
        <Card className="overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Employee Positions</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            <div className="h-[calc(100vh-22rem)] min-h-80">
              <EmployeeMap
                markers={markers}
                isLoading={isLoading}
                selectedEmployeeId={selectedId}
              />
            </div>
          </CardContent>
        </Card>

        {/* Employee sidebar */}
        <Card className="flex flex-col overflow-hidden">
          <CardHeader className="pb-2 shrink-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              Employees
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 p-3 overflow-hidden">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder="Search employees…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-8 text-sm"
              />
            </div>

            {/* Status summary */}
            <div className="flex gap-3 text-xs text-muted-foreground px-1">
              <span><span className="font-semibold text-emerald-600 dark:text-emerald-400">{activeCount}</span> active</span>
              <span><span className="font-semibold text-orange-500">{recentCount}</span> recent</span>
              <span><span className="font-semibold text-slate-400">{inactiveCount}</span> inactive</span>
            </div>

            {/* Scrollable list */}
            <div className="flex-1 overflow-y-auto space-y-0.5" style={{ maxHeight: "calc(100vh - 28rem)" }}>
              {isLoading && (
                <div className="flex flex-col gap-2 py-4">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2">
                      <div className="h-8 w-8 rounded-full bg-muted animate-pulse" />
                      <div className="h-4 flex-1 rounded bg-muted animate-pulse" />
                    </div>
                  ))}
                </div>
              )}

              {!isLoading && filtered.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">No employees found</p>
              )}

              {/* Sort: ACTIVE first, then RECENT, then INACTIVE */}
              {[...filtered]
                .sort((a, b) => {
                  const order = { ACTIVE: 0, RECENT: 1, INACTIVE: 2 };
                  return order[a.status] - order[b.status];
                })
                .map((m) => (
                  <EmployeeListItem
                    key={m.employeeId}
                    marker={m}
                    selected={selectedId === m.employeeId}
                    onClick={() => handleSelect(m.employeeId)}
                  />
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Empty state */}
      {!isLoading && markers.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <MapPin className="h-10 w-10 text-muted-foreground/30" />
          <p className="text-sm font-medium text-muted-foreground">No GPS data yet</p>
          <p className="text-xs text-muted-foreground/60 max-w-sm">
            Markers appear after employees check in and record a location point.
          </p>
        </div>
      )}
    </div>
  );
}
