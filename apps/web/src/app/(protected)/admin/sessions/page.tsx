"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useAllOrgSessions, useEmployeeSessionHistory } from "@/hooks/queries/useSessions";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmployeeIdentity } from "@/components/EmployeeIdentity";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { AttendanceSession, ActivityStatus } from "@/types";
import { formatDate, formatTime, formatDistance, formatDuration, cn } from "@/lib/utils";
import { Clock, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// --- Constants ----------------------------------------------------------------

const VIEW_PAGE_SIZE = 25;

// --- Types --------------------------------------------------------------------

type FilterTab = "all" | ActivityStatus;

const TABS: { key: FilterTab; label: string }[] = [
  { key: "all", label: "All" },
  { key: "ACTIVE", label: "Active" },
  { key: "RECENT", label: "Recently Active" },
  { key: "INACTIVE", label: "Inactive" },
];

interface EmployeeSessionGroup {
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  activityStatus: ActivityStatus;
  latestSession: AttendanceSession;
  sessions: AttendanceSession[];
}

// --- Helpers ------------------------------------------------------------------

function deriveStatus(session: AttendanceSession): ActivityStatus {
  if (!session.checkout_at) return "ACTIVE";
  const lastTs = new Date(session.checkout_at).getTime();
  return Date.now() - lastTs < 86_400_000 ? "RECENT" : "INACTIVE";
}

const STATUS_ORDER: Record<ActivityStatus, number> = { ACTIVE: 0, RECENT: 1, INACTIVE: 2 };

function groupSessions(sessions: AttendanceSession[]): EmployeeSessionGroup[] {
  const map = new Map<string, AttendanceSession[]>();
  for (const s of sessions) {
    const arr = map.get(s.employee_id) ?? [];
    arr.push(s);
    map.set(s.employee_id, arr);
  }
  const groups: EmployeeSessionGroup[] = [];
  for (const [empId, empSessions] of map) {
    const sorted = [...empSessions].sort(
      (a, b) => new Date(b.checkin_at).getTime() - new Date(a.checkin_at).getTime()
    );
    const latest = sorted[0];
    const status = latest.activityStatus ?? deriveStatus(latest);
    groups.push({
      employeeId: empId,
      employeeName: latest.employee_name ?? latest.employee_code ?? empId,
      employeeCode: latest.employee_code ?? null,
      activityStatus: status,
      latestSession: latest,
      sessions: sorted,
    });
  }
  groups.sort((a, b) => {
    const sd = STATUS_ORDER[a.activityStatus] - STATUS_ORDER[b.activityStatus];
    if (sd !== 0) return sd;
    return (
      new Date(b.latestSession.checkin_at).getTime() -
      new Date(a.latestSession.checkin_at).getTime()
    );
  });
  return groups;
}

// --- Sub-components -----------------------------------------------------------

function StatusBadge({ status }: { status: ActivityStatus }) {
  if (status === "ACTIVE")
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-950 dark:text-emerald-300">
        Active
      </Badge>
    );
  if (status === "RECENT")
    return (
      <Badge className="bg-blue-100 text-blue-800 border-transparent dark:bg-blue-950 dark:text-blue-300">
        Recent
      </Badge>
    );
  return (
    <Badge className="bg-gray-100 text-gray-600 border-transparent dark:bg-gray-800 dark:text-gray-400">
      Inactive
    </Badge>
  );
}

function SessionHistorySheet({
  group,
  onClose,
}: {
  group: EmployeeSessionGroup | null;
  onClose: () => void;
}) {
  const { data: historyPage, isLoading: historyLoading } = useEmployeeSessionHistory(
    group?.employeeId ?? null,
  );
  const historySessions = historyPage?.data ?? [];

  return (
    <Sheet open={!!group} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col">
        {group && (
          <>
            <SheetHeader className="px-6 py-5 border-b shrink-0">
              <SheetTitle className="sr-only">Session History</SheetTitle>
              <EmployeeIdentity
                employeeId={group.employeeId}
                name={group.employeeName}
                employeeCode={group.employeeCode}
                activityStatus={group.activityStatus}
                isAdmin
                showTooltip={false}
                size="md"
              />
              <p className="text-sm text-muted-foreground mt-1">
                {historyLoading
                  ? "Loading sessions…"
                  : `${historySessions.length} session${historySessions.length !== 1 ? "s" : ""} total`}
              </p>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto divide-y">
              {historyLoading &&
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="px-6 py-4 animate-pulse space-y-2">
                    <div className="h-3 w-32 rounded bg-muted" />
                    <div className="h-2.5 w-48 rounded bg-muted" />
                  </div>
                ))}
              {!historyLoading &&
                historySessions.map((session) => {
                  const status = session.activityStatus ?? deriveStatus(session);
                  return (
                    <div
                      key={session.id}
                      className={cn(
                        "px-6 py-4",
                        status === "ACTIVE" && "bg-emerald-50/50 dark:bg-emerald-950/20"
                      )}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium">{formatDate(session.checkin_at)}</span>
                            <StatusBadge status={status} />
                          </div>
                          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                            <Clock className="h-3 w-3 shrink-0" />
                            <span>
                              {formatTime(session.checkin_at)}
                              {session.checkout_at
                                ? ` to ${formatTime(session.checkout_at)}`
                                : " (checked in)"}
                            </span>
                          </div>
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <p className="text-sm tabular-nums text-muted-foreground">
                            {formatDistance(session.total_distance_km)}
                          </p>
                          <p className="text-sm tabular-nums text-muted-foreground">
                            {formatDuration(session.total_duration_seconds)}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmployeeSessionRow({
  group,
  onClick,
}: {
  group: EmployeeSessionGroup;
  onClick: () => void;
}) {
  const s = group.latestSession;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 items-center px-4 py-3",
        "cursor-pointer hover:bg-muted/40 transition-colors",
        group.activityStatus === "ACTIVE" && "border-l-2 border-l-emerald-500"
      )}
      onClick={onClick}
    >
      <div>
        <EmployeeIdentity
          employeeId={group.employeeId}
          name={group.employeeName}
          employeeCode={group.employeeCode}
          activityStatus={group.activityStatus}
          isAdmin
          showTooltip
          size="sm"
        />
      </div>

      <div className="flex flex-col">
        <span className="text-sm">{formatDate(s.checkin_at)}</span>
        <span className="text-xs text-muted-foreground">{formatTime(s.checkin_at)}</span>
      </div>

      <div className="flex flex-col">
        {s.checkout_at ? (
          <>
            <span className="text-sm">{formatDate(s.checkout_at)}</span>
            <span className="text-xs text-muted-foreground">{formatTime(s.checkout_at)}</span>
          </>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600 font-medium">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            Live
          </span>
        )}
      </div>

      <span className="text-sm tabular-nums">{formatDistance(s.total_distance_km)}</span>
      <span className="text-sm tabular-nums">{formatDuration(s.total_duration_seconds)}</span>

      <div>
        <StatusBadge status={group.activityStatus} />
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </motion.div>
  );
}

// --- Page ---------------------------------------------------------------------

export default function AdminSessionsPage() {
  const { permissions } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<FilterTab>("all");
  const [selectedGroup, setSelectedGroup] = useState<EmployeeSessionGroup | null>(null);
  const [viewPage, setViewPage] = useState(1);

  useEffect(() => {
    if (!permissions.viewOrgSessions) router.replace("/sessions");
  }, [permissions, router]);

  const { data: allSessions, isLoading, error, refetch } = useAllOrgSessions();
  const groups = useMemo(() => groupSessions(allSessions), [allSessions]);

  const tabCounts = useMemo(() => {
    const counts: Record<FilterTab, number> = { all: groups.length, ACTIVE: 0, RECENT: 0, INACTIVE: 0 };
    for (const g of groups) counts[g.activityStatus]++;
    return counts;
  }, [groups]);

  const filtered = useMemo(
    () => (activeTab === "all" ? groups : groups.filter((g) => g.activityStatus === activeTab)),
    [groups, activeTab]
  );

  const paged = filtered.slice(0, viewPage * VIEW_PAGE_SIZE);
  const hasMore = paged.length < filtered.length;

  if (!permissions.viewOrgSessions) return null;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">All Sessions</h2>
        <p className="text-muted-foreground">
          {isLoading
            ? "Loading..."
            : `${groups.length} employee${groups.length !== 1 ? "s" : ""} with session activity`}
        </p>
      </div>

      {error && <ErrorBanner error={error} onRetry={() => void refetch()} />}

      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => { setActiveTab(tab.key); setViewPage(1); }}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeTab === tab.key
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
            {!isLoading && (
              <span
                className={cn(
                  "rounded-full px-1.5 py-px text-[10px] font-semibold",
                  activeTab === tab.key
                    ? "bg-muted text-foreground"
                    : "bg-muted/60 text-muted-foreground"
                )}
              >
                {tabCounts[tab.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2.5 border-b bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <span>Employee</span>
          <span>Latest Check-in</span>
          <span>Latest Check-out</span>
          <span>Distance</span>
          <span>Duration</span>
          <span>Status</span>
          <span />
        </div>

        {isLoading && (
          <div className="divide-y">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_1fr_1fr_auto] gap-3 items-center px-4 py-3 animate-pulse"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                  <div className="space-y-1.5">
                    <div className="h-3 w-28 rounded bg-muted" />
                    <div className="h-2.5 w-16 rounded bg-muted" />
                  </div>
                </div>
                {Array.from({ length: 5 }).map((_, j) => (
                  <div key={j} className="h-3 w-16 rounded bg-muted" />
                ))}
                <div />
              </div>
            ))}
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Clock className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No sessions found</p>
            <p className="text-sm text-muted-foreground/60">
              {activeTab !== "all"
                ? "Try switching to a different filter"
                : "Sessions will appear here once recorded"}
            </p>
          </div>
        )}

        {!isLoading && filtered.length > 0 && (
          <div className="divide-y">
            <AnimatePresence initial={false}>
              {paged.map((group) => (
                <EmployeeSessionRow
                  key={group.employeeId}
                  group={group}
                  onClick={() => setSelectedGroup(group)}
                />
              ))}
            </AnimatePresence>

            {hasMore && (
              <div className="flex justify-center py-3 border-t">
                <button
                  onClick={() => setViewPage((p) => p + 1)}
                  className="text-sm text-primary hover:underline"
                >
                  Load more ({filtered.length - paged.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <SessionHistorySheet
        group={selectedGroup}
        onClose={() => setSelectedGroup(null)}
      />
    </div>
  );
}