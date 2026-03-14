"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrgExpenses, useUpdateExpenseStatus } from "@/hooks/queries/useExpenses";
import { ErrorBanner } from "@/components/ErrorBanner";
import { EmployeeIdentity } from "@/components/EmployeeIdentity";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useToast } from "@/components/ui/use-toast";
import { Expense, ExpenseStatus } from "@/types";
import { formatCurrency, formatDate, cn } from "@/lib/utils";
import { Receipt, ChevronRight, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

// ─── Constants ────────────────────────────────────────────────────────────────

const FETCH_LIMIT = 200;
const VIEW_PAGE_SIZE = 25;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EmployeeExpenseGroup {
  employeeId: string;
  employeeName: string;
  employeeCode: string | null;
  pendingCount: number;
  pendingAmount: number;
  latestExpenseDate: string;
  expenses: Expense[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function groupExpenses(expenses: Expense[]): EmployeeExpenseGroup[] {
  const map = new Map<string, Expense[]>();
  for (const e of expenses) {
    const arr = map.get(e.employee_id) ?? [];
    arr.push(e);
    map.set(e.employee_id, arr);
  }

  const groups: EmployeeExpenseGroup[] = [];
  for (const [empId, empExpenses] of map) {
    const sorted = [...empExpenses].sort(
      (a, b) => new Date(b.submitted_at).getTime() - new Date(a.submitted_at).getTime()
    );
    const latest = sorted[0];
    const pending = sorted.filter((e) => e.status === "PENDING");
    groups.push({
      employeeId: empId,
      employeeName: latest.employee_name ?? `Employee …${empId.slice(-4)}`,
      employeeCode: latest.employee_code ?? null,
      pendingCount: pending.length,
      pendingAmount: pending.reduce((sum, e) => sum + e.amount, 0),
      latestExpenseDate: latest.submitted_at,
      expenses: sorted,
    });
  }

  // Employees with PENDING expenses first, then by most recent activity
  groups.sort((a, b) => {
    if (b.pendingCount !== a.pendingCount) return b.pendingCount - a.pendingCount;
    return new Date(b.latestExpenseDate).getTime() - new Date(a.latestExpenseDate).getTime();
  });

  return groups;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ExpenseStatusBadge({ status }: { status: ExpenseStatus }) {
  if (status === "APPROVED")
    return (
      <Badge className="bg-emerald-100 text-emerald-800 border-transparent dark:bg-emerald-950 dark:text-emerald-300">
        Approved
      </Badge>
    );
  if (status === "REJECTED")
    return (
      <Badge className="bg-rose-100 text-rose-700 border-transparent dark:bg-rose-950 dark:text-rose-300">
        Rejected
      </Badge>
    );
  return (
    <Badge className="bg-amber-100 text-amber-800 border-transparent dark:bg-amber-950 dark:text-amber-300">
      Pending
    </Badge>
  );
}

function ExpenseReviewSheet({
  group,
  onClose,
  onAction,
  isPending,
}: {
  group: EmployeeExpenseGroup | null;
  onClose: () => void;
  onAction: (expense: Expense, status: ExpenseStatus) => void;
  isPending: boolean;
}) {
  return (
    <Sheet open={!!group} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-[480px] p-0 flex flex-col">
        {group && (
          <>
            <SheetHeader className="px-6 py-5 border-b shrink-0">
              <SheetTitle className="sr-only">Expense Review</SheetTitle>
              <EmployeeIdentity
                employeeId={group.employeeId}
                name={group.employeeName}
                employeeCode={group.employeeCode}
                isAdmin
                showTooltip={false}
                size="md"
              />
              <p className="text-sm text-muted-foreground mt-1">
                {group.pendingCount > 0
                  ? `${group.pendingCount} pending · ${formatCurrency(group.pendingAmount)}`
                  : "No pending expenses"}
              </p>
            </SheetHeader>

            <div className="flex-1 overflow-y-auto divide-y">
              {group.expenses.map((expense) => (
                <div
                  key={expense.id}
                  className={cn(
                    "px-6 py-4 space-y-3",
                    expense.status === "PENDING" && "bg-amber-50/50 dark:bg-amber-950/20"
                  )}
                >
                  {/* Header row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-0.5 min-w-0">
                      <p className="font-medium text-sm truncate">{expense.description}</p>
                      <p className="text-xs text-muted-foreground">
                        Submitted {formatDate(expense.submitted_at)}
                        {expense.reviewed_at && ` · Reviewed ${formatDate(expense.reviewed_at)}`}
                      </p>
                    </div>
                    <div className="text-right shrink-0 space-y-1">
                      <p className="font-semibold text-sm tabular-nums">
                        {formatCurrency(expense.amount)}
                      </p>
                      <ExpenseStatusBadge status={expense.status} />
                    </div>
                  </div>

                  {/* Receipt link */}
                  {expense.receipt_url && (
                    <a
                      href={expense.receipt_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <ExternalLink className="h-3 w-3" />
                      View receipt
                    </a>
                  )}

                  {/* Approve / Reject actions */}
                  {expense.status === "PENDING" && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                        onClick={() => onAction(expense, "APPROVED")}
                        disabled={isPending}
                      >
                        <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="flex-1 border-rose-300 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30"
                        onClick={() => onAction(expense, "REJECTED")}
                        disabled={isPending}
                      >
                        <XCircle className="h-3.5 w-3.5 mr-1.5" />
                        Reject
                      </Button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function EmployeeExpenseRow({
  group,
  onClick,
}: {
  group: EmployeeExpenseGroup;
  onClick: () => void;
}) {
  const hasPending = group.pendingCount > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 items-center px-4 py-3",
        "cursor-pointer hover:bg-muted/40 transition-colors",
        hasPending && "border-l-2 border-l-amber-400 bg-amber-50/30 dark:bg-amber-950/10"
      )}
      onClick={onClick}
    >
      <div>
        <EmployeeIdentity
          employeeId={group.employeeId}
          name={group.employeeName}
          employeeCode={group.employeeCode}
          isAdmin
          showTooltip
          size="sm"
        />
      </div>

      <div>
        {hasPending ? (
          <Badge className="bg-amber-100 text-amber-800 border-transparent dark:bg-amber-950 dark:text-amber-300">
            {group.pendingCount} Pending
          </Badge>
        ) : (
          <span className="text-sm text-muted-foreground">—</span>
        )}
      </div>

      <div className="text-sm font-medium tabular-nums">
        {group.pendingAmount > 0 ? (
          formatCurrency(group.pendingAmount)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </div>

      <div className="text-sm text-muted-foreground">
        {formatDate(group.latestExpenseDate)}
      </div>

      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </motion.div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminExpensesPage() {
  const { permissions } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  const [selectedGroup, setSelectedGroup] = useState<EmployeeExpenseGroup | null>(null);
  const [viewPage, setViewPage] = useState(1);

  useEffect(() => {
    if (!permissions.manageExpenses) router.replace("/sessions");
  }, [permissions, router]);

  const { data, isLoading, error } = useOrgExpenses(1, FETCH_LIMIT);
  const updateStatus = useUpdateExpenseStatus();

  const allExpenses = data?.data ?? [];
  const groups = useMemo(() => groupExpenses(allExpenses), [allExpenses]);

  // Keep the open sheet in sync with fresh data after mutations
  const refreshedGroup = useMemo(() => {
    if (!selectedGroup) return null;
    return groups.find((g) => g.employeeId === selectedGroup.employeeId) ?? null;
  }, [groups, selectedGroup]);

  const displayGroup = refreshedGroup ?? selectedGroup;

  const paged = groups.slice(0, viewPage * VIEW_PAGE_SIZE);
  const hasMore = paged.length < groups.length;
  const pendingEmployees = groups.filter((g) => g.pendingCount > 0).length;

  if (!permissions.manageExpenses) return null;

  function handleAction(expense: Expense, status: ExpenseStatus) {
    updateStatus.mutate(
      { id: expense.id, status },
      {
        onSuccess: () => {
          toast({
            title: status === "APPROVED" ? "Expense approved" : "Expense rejected",
            description: `${expense.description} · ${formatCurrency(expense.amount)}`,
          });
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Failed to update",
            description: err.message,
          });
        },
      }
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Manage Expenses</h2>
          <p className="text-muted-foreground">
            {isLoading
              ? "Loading..."
              : `${groups.length} employees · ${
                  pendingEmployees > 0
                    ? `${pendingEmployees} require${pendingEmployees === 1 ? "s" : ""} attention`
                    : "all clear"
                }`}
          </p>
        </div>
        {pendingEmployees > 0 && !isLoading && (
          <Badge className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 mt-1 shrink-0">
            {pendingEmployees} pending
          </Badge>
        )}
      </div>

      {error && <ErrorBanner error={error} />}

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 px-4 py-2.5 border-b bg-muted/30 text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          <span>Employee</span>
          <span>Pending Expenses</span>
          <span>Pending Amount</span>
          <span>Latest Expense</span>
          <span />
        </div>

        {/* Skeleton */}
        {isLoading && (
          <div className="divide-y">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[2fr_1fr_1fr_1fr_auto] gap-3 items-center px-4 py-3 animate-pulse"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-8 w-8 rounded-full bg-muted shrink-0" />
                  <div className="space-y-1.5">
                    <div className="h-3 w-28 rounded bg-muted" />
                    <div className="h-2.5 w-16 rounded bg-muted" />
                  </div>
                </div>
                {Array.from({ length: 3 }).map((_, j) => (
                  <div key={j} className="h-3 w-16 rounded bg-muted" />
                ))}
                <div />
              </div>
            ))}
          </div>
        )}

        {/* Empty */}
        {!isLoading && groups.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Receipt className="h-10 w-10 text-muted-foreground/40" />
            <p className="font-medium text-muted-foreground">No expenses found</p>
          </div>
        )}

        {/* Rows */}
        {!isLoading && groups.length > 0 && (
          <div className="divide-y">
            <AnimatePresence initial={false}>
              {paged.map((group) => (
                <EmployeeExpenseRow
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
                  Load more ({groups.length - paged.length} remaining)
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Expense review slide-in panel */}
      <ExpenseReviewSheet
        group={displayGroup}
        onClose={() => setSelectedGroup(null)}
        onAction={handleAction}
        isPending={updateStatus.isPending}
      />
    </div>
  );
}
