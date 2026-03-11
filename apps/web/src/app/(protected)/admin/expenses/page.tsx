"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/hooks/useAuth";
import { useOrgExpenses, useUpdateExpenseStatus } from "@/hooks/queries/useExpenses";
import { ExpensesTable } from "@/components/tables/ExpensesTable";
import { ErrorBanner } from "@/components/ErrorBanner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { ExpenseStatus } from "@/types";

const PAGE_LIMIT = 20;

interface PendingAction {
  id: string;
  status: ExpenseStatus;
}

export default function AdminExpensesPage() {
  const { permissions } = useAuth();
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (!permissions.manageExpenses) {
      router.replace("/sessions");
    }
  }, [permissions, router]);

  const [page, setPage] = useState(1);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);

  const { data, isLoading, error } = useOrgExpenses(page, PAGE_LIMIT);
  const updateStatus = useUpdateExpenseStatus();

  const expenses = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const hasMore = page * PAGE_LIMIT < total;

  if (!permissions.manageExpenses) return null;

  function handleConfirm() {
    if (!pendingAction) return;

    updateStatus.mutate(
      { id: pendingAction.id, status: pendingAction.status },
      {
        onSuccess: () => {
          toast({
            title: "Status updated",
            description: `Expense has been ${pendingAction.status.toLowerCase()}.`,
          });
          setPendingAction(null);
        },
        onError: (err) => {
          toast({
            variant: "destructive",
            title: "Failed to update",
            description: err.message,
          });
          setPendingAction(null);
        },
      }
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">Manage Expenses</h2>
        <p className="text-muted-foreground">Review and approve or reject expense claims.</p>
      </div>

      {error && <ErrorBanner error={error} />}

      <ExpensesTable
        expenses={expenses}
        showActions={true}
        isLoading={isLoading}
        onApprove={(id) => setPendingAction({ id, status: "APPROVED" })}
        onReject={(id) => setPendingAction({ id, status: "REJECTED" })}
        page={page}
        hasMore={hasMore}
        onPageChange={setPage}
      />

      <Dialog
        open={!!pendingAction}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {pendingAction?.status === "APPROVED" ? "Approve" : "Reject"} Expense
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to{" "}
              {pendingAction?.status === "APPROVED" ? "approve" : "reject"} this expense?
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPendingAction(null)}>
              Cancel
            </Button>
            <Button
              variant={pendingAction?.status === "APPROVED" ? "default" : "destructive"}
              onClick={handleConfirm}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? "Updating..." : "Confirm"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
