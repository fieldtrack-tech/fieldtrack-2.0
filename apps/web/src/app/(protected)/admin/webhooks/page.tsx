"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Webhook,
  Plus,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  XCircle,
  Clock,
  ToggleLeft,
  ToggleRight,
  Eye,
  EyeOff,
  Copy,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useWebhooks,
  useWebhookDeliveries,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useRetryDelivery,
  WEBHOOK_EVENT_TYPES,
  type WebhookRecord,
  type WebhookDelivery,
  type DeliveryStatus,
  type CreateWebhookBody,
} from "@/hooks/queries/useWebhooks";

// ─── Constants ────────────────────────────────────────────────────────────────

const EVENT_LABELS: Record<string, string> = {
  "employee.checked_in": "Check In",
  "employee.checked_out": "Check Out",
  "expense.created": "Expense Created",
  "expense.approved": "Expense Approved",
  "expense.rejected": "Expense Rejected",
  "employee.created": "Employee Created",
};

const STATUS_CONFIG: Record<
  DeliveryStatus,
  { label: string; icon: React.ElementType; className: string }
> = {
  success: { label: "Success", icon: CheckCircle2, className: "text-emerald-500" },
  failed:  { label: "Failed",  icon: XCircle,     className: "text-rose-500" },
  pending: { label: "Pending", icon: Clock,        className: "text-amber-500" },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  if (diff < 60_000) return "Just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── Delivery Status Badge ────────────────────────────────────────────────────

function DeliveryStatusBadge({ status }: { status: DeliveryStatus }) {
  const { label, icon: Icon, className } = STATUS_CONFIG[status];
  return (
    <span className={cn("flex items-center gap-1 text-xs font-semibold", className)}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </span>
  );
}

// ─── Expandable Payload Row ───────────────────────────────────────────────────

function DeliveryRow({ delivery, onRetry, isRetrying }: {
  delivery: WebhookDelivery;
  onRetry: (id: string) => void;
  isRetrying: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="border-b border-border/40 last:border-0">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-accent/40 transition-colors"
      >
        <DeliveryStatusBadge status={delivery.status} />
        <span className="flex-1 min-w-0">
          <span className="text-xs text-muted-foreground">
            {delivery.last_attempt_at
              ? formatRelativeTime(delivery.last_attempt_at)
              : "Not attempted"}
          </span>
        </span>
        {delivery.response_status != null && (
          <span
            className={cn(
              "text-xs font-mono font-semibold px-1.5 py-0.5 rounded",
              delivery.response_status >= 200 && delivery.response_status < 300
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                : "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
            )}
          >
            {delivery.response_status}
          </span>
        )}
        <span className="text-xs text-muted-foreground/60">
          #{delivery.attempt_count} attempt{delivery.attempt_count !== 1 ? "s" : ""}
        </span>
        {delivery.status === "failed" && (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs gap-1.5"
            disabled={isRetrying}
            onClick={(e) => { e.stopPropagation(); onRetry(delivery.id); }}
          >
            <RefreshCw className={cn("h-3 w-3", isRetrying && "animate-spin")} />
            Retry
          </Button>
        )}
        {expanded ? (
          <ChevronUp className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-3 pt-0 space-y-2">
              <div className="rounded-lg bg-muted/60 p-3">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60 mb-1.5">
                  Response Body
                </p>
                <pre className="text-xs font-mono text-foreground/80 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                  {delivery.response_body ?? "(no response body)"}
                </pre>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>Event: <code className="font-mono text-foreground/70">{delivery.event_id.slice(0, 8)}…</code></span>
                <span>Delivery: <code className="font-mono text-foreground/70">{delivery.id.slice(0, 8)}…</code></span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Deliveries Panel ─────────────────────────────────────────────────────────

function DeliveriesPanel({ webhookId }: { webhookId: string | null }) {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<DeliveryStatus | undefined>(undefined);
  const retryDelivery = useRetryDelivery();
  const { toast } = useToast();

  const { data, isLoading } = useWebhookDeliveries(
    page,
    20,
    webhookId ?? undefined,
    statusFilter,
  );

  const deliveries = data?.data ?? [];
  const total = data?.pagination.total ?? 0;
  const hasMore = page * 20 < total;

  function handleRetry(id: string) {
    retryDelivery.mutate(id, {
      onSuccess: () => toast({ title: "Delivery queued for retry" }),
      onError: (e) => toast({ variant: "destructive", title: "Retry failed", description: e.message }),
    });
  }

  const FILTERS: { key: DeliveryStatus | undefined; label: string }[] = [
    { key: undefined, label: "All" },
    { key: "pending", label: "Pending" },
    { key: "success", label: "Success" },
    { key: "failed", label: "Failed" },
  ];

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex gap-1 rounded-lg border bg-muted/40 p-1 w-fit">
        {FILTERS.map((f) => (
          <button
            key={String(f.key)}
            onClick={() => { setStatusFilter(f.key); setPage(1); }}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              statusFilter === f.key
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        {isLoading && (
          <div className="divide-y">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-3 w-28 flex-1" />
                <Skeleton className="h-5 w-10" />
              </div>
            ))}
          </div>
        )}

        {!isLoading && deliveries.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 gap-3">
            <Clock className="h-10 w-10 text-muted-foreground/30" />
            <p className="text-sm font-medium text-muted-foreground">No deliveries yet</p>
            <p className="text-xs text-muted-foreground/60 text-center max-w-xs">
              Deliveries appear here when a webhook event is triggered.
            </p>
          </div>
        )}

        {!isLoading && deliveries.length > 0 && (
          <div>
            {deliveries.map((d) => (
              <DeliveryRow
                key={d.id}
                delivery={d}
                onRetry={handleRetry}
                isRetrying={retryDelivery.isPending && retryDelivery.variables === d.id}
              />
            ))}
          </div>
        )}
      </div>

      {(deliveries.length > 0 || page > 1) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{total} total deliveries</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
              Previous
            </Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" disabled={!hasMore} onClick={() => setPage(p => p + 1)}>
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Webhook Card ─────────────────────────────────────────────────────────────

function WebhookCard({
  webhook,
  onEdit,
  onDelete,
}: {
  webhook: WebhookRecord;
  onEdit: (w: WebhookRecord) => void;
  onDelete: (id: string) => void;
}) {
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [copied, setCopied] = useState(false);

  const updateWebhook = useUpdateWebhook(webhook.id);
  const { toast } = useToast();

  function handleToggleActive() {
    updateWebhook.mutate(
      { is_active: !webhook.is_active },
      {
        onSuccess: () =>
          toast({ title: `Webhook ${!webhook.is_active ? "enabled" : "disabled"}` }),
        onError: (e) =>
          toast({ variant: "destructive", title: "Update failed", description: e.message }),
      }
    );
  }

  function copyUrl() {
    void navigator.clipboard.writeText(webhook.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      className="rounded-xl border bg-card overflow-hidden"
    >
      {/* Header row */}
      <div className="flex items-start gap-3 p-4">
        {/* Status dot */}
        <div className="mt-1 shrink-0">
          {webhook.is_active ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
          ) : (
            <span className="h-2.5 w-2.5 rounded-full bg-muted-foreground/30 inline-block" />
          )}
        </div>

        {/* URL + events */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex items-center gap-2">
            <code className="text-sm font-mono truncate text-foreground/80 flex-1 min-w-0">
              {webhook.url}
            </code>
            <button
              onClick={copyUrl}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
              title="Copy URL"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {webhook.events.map((e) => (
              <Badge
                key={e}
                variant="secondary"
                className="text-[10px] font-medium px-1.5 py-0"
              >
                {EVENT_LABELS[e] ?? e}
              </Badge>
            ))}
          </div>
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-1">
          <button
            onClick={handleToggleActive}
            disabled={updateWebhook.isPending}
            className="p-1.5 rounded-lg hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground disabled:opacity-50"
            title={webhook.is_active ? "Disable webhook" : "Enable webhook"}
          >
            {webhook.is_active ? (
              <ToggleRight className="h-5 w-5 text-emerald-500" />
            ) : (
              <ToggleLeft className="h-5 w-5" />
            )}
          </button>
          <button
            onClick={() => onEdit(webhook)}
            className="p-1.5 rounded-lg hover:bg-accent/60 transition-colors text-muted-foreground hover:text-foreground"
            title="Edit webhook"
          >
            <Eye className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(webhook.id)}
            className="p-1.5 rounded-lg hover:bg-rose-100 dark:hover:bg-rose-950/30 transition-colors text-muted-foreground hover:text-rose-500"
            title="Delete webhook"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Deliveries toggle */}
      <button
        onClick={() => setShowDeliveries(!showDeliveries)}
        className="flex w-full items-center justify-between px-4 py-2 border-t border-border/40 bg-muted/20 hover:bg-muted/40 transition-colors text-xs text-muted-foreground hover:text-foreground"
      >
        <span className="font-medium">Delivery History</span>
        {showDeliveries ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      <AnimatePresence>
        {showDeliveries && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 pt-0 mt-4">
              <DeliveriesPanel webhookId={webhook.id} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ─── Create / Edit Sheet ──────────────────────────────────────────────────────

interface WebhookFormState {
  url: string;
  secret: string;
  events: Set<string>;
}

function WebhookSheet({
  open,
  editing,
  onClose,
}: {
  open: boolean;
  editing: WebhookRecord | null;
  onClose: () => void;
}) {
  const { toast } = useToast();
  const createWebhook = useCreateWebhook();
  // Always call the hook — pass editing.id when editing, empty string otherwise.
  // An empty string never triggers a real request (mutations are on-demand).
  const updateWebhook = useUpdateWebhook(editing?.id ?? "");
  const [showSecret, setShowSecret] = useState(false);
  const [form, setForm] = useState<WebhookFormState>({
    url: "",
    secret: "",
    events: new Set(),
  });

  // Sync form when the editing target changes
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useState(() => {
    if (editing) {
      setForm({ url: editing.url, secret: "", events: new Set(editing.events) });
    } else {
      setForm({ url: "", secret: "", events: new Set() });
    }
  });

  function handleOpen(isOpen: boolean) {
    if (!isOpen) {
      setForm({ url: "", secret: "", events: new Set() });
      onClose();
    }
  }

  function toggleEvent(event: string) {
    setForm((f) => {
      const next = new Set(f.events);
      next.has(event) ? next.delete(event) : next.add(event);
      return { ...f, events: next };
    });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (form.events.size === 0) {
      toast({ variant: "destructive", title: "Select at least one event" });
      return;
    }

    if (editing) {
      const patch: Parameters<typeof updateWebhook.mutate>[0] = {
        url: form.url || editing.url,
        events: [...form.events] as CreateWebhookBody["events"],
      };
      if (form.secret) patch.secret = form.secret;

      updateWebhook.mutate(patch, {
        onSuccess: () => { toast({ title: "Webhook updated" }); onClose(); },
        onError: (err) => toast({ variant: "destructive", title: "Update failed", description: err.message }),
      });
    } else {
      if (form.url.length < 5) {
        toast({ variant: "destructive", title: "Enter a valid URL" });
        return;
      }
      if (form.secret.length < 16) {
        toast({ variant: "destructive", title: "Secret must be ≥ 16 characters" });
        return;
      }
      createWebhook.mutate(
        {
          url: form.url,
          secret: form.secret,
          events: [...form.events] as CreateWebhookBody["events"],
        },
        {
          onSuccess: () => { toast({ title: "Webhook registered" }); onClose(); },
          onError: (err) => toast({ variant: "destructive", title: "Failed to create webhook", description: err.message }),
        }
      );
    }
  }

  const isPending = createWebhook.isPending || updateWebhook.isPending;

  return (
    <Sheet open={open} onOpenChange={handleOpen}>
      <SheetContent side="right" className="w-full sm:max-w-[460px] flex flex-col gap-0 p-0">
        <SheetHeader className="px-6 py-5 border-b">
          <SheetTitle className="flex items-center gap-2">
            <Webhook className="h-5 w-5 text-primary" />
            {editing ? "Edit Webhook" : "Register Webhook"}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-y-auto">
          <div className="flex-1 space-y-5 px-6 py-5">
            {/* URL */}
            <div className="space-y-1.5">
              <Label htmlFor="wh-url">Endpoint URL</Label>
              <Input
                id="wh-url"
                type="url"
                placeholder="https://example.com/webhooks/fieldtrack"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                required={!editing}
              />
              <p className="text-xs text-muted-foreground">
                FieldTrack will POST JSON events to this URL.
              </p>
            </div>

            {/* Secret */}
            <div className="space-y-1.5">
              <Label htmlFor="wh-secret">
                {editing ? "Secret (leave blank to keep current)" : "Signing Secret"}
              </Label>
              <div className="relative">
                <Input
                  id="wh-secret"
                  type={showSecret ? "text" : "password"}
                  placeholder={editing ? "••••••••••••••••" : "min. 16 characters"}
                  value={form.secret}
                  onChange={(e) => setForm((f) => ({ ...f, secret: e.target.value }))}
                  required={!editing}
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(!showSecret)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showSecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Used to sign the <code className="font-mono text-xs">X-FieldTrack-Signature</code> header.
              </p>
            </div>

            {/* Events */}
            <div className="space-y-2">
              <Label>Events to Subscribe</Label>
              <div className="grid grid-cols-1 gap-2">
                {WEBHOOK_EVENT_TYPES.map((event) => {
                  const checked = form.events.has(event);
                  return (
                    <label
                      key={event}
                      className={cn(
                        "flex items-center gap-3 rounded-lg border px-3 py-2.5 cursor-pointer transition-colors",
                        checked
                          ? "border-primary/50 bg-primary/5"
                          : "border-border/60 hover:bg-accent/40"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleEvent(event)}
                        className="h-4 w-4 rounded accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{EVENT_LABELS[event]}</p>
                        <p className="text-xs text-muted-foreground font-mono">{event}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <SheetFooter className="px-6 py-4 border-t gap-2">
            <Button type="button" variant="outline" onClick={onClose} className="flex-1">
              Cancel
            </Button>
            <Button type="submit" disabled={isPending} className="flex-1">
              {isPending ? "Saving…" : editing ? "Save Changes" : "Register Webhook"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

// ─── Delete Confirm Dialog ────────────────────────────────────────────────────

function DeleteWebhookDialog({
  webhookId,
  onClose,
}: {
  webhookId: string | null;
  onClose: () => void;
}) {
  const deleteWebhook = useDeleteWebhook();
  const { toast } = useToast();

  function handleConfirm() {
    if (!webhookId) return;
    deleteWebhook.mutate(webhookId, {
      onSuccess: () => { toast({ title: "Webhook deleted" }); onClose(); },
      onError: (e) => { toast({ variant: "destructive", title: "Delete failed", description: e.message }); onClose(); },
    });
  }

  return (
    <AlertDialog open={!!webhookId} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete webhook?</AlertDialogTitle>
          <AlertDialogDescription>
            This will permanently remove the webhook endpoint and all its delivery
            history. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deleteWebhook.isPending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function WebhooksPage() {
  const { data: webhooks, isLoading, error } = useWebhooks();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<WebhookRecord | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  function openCreate() {
    setEditingWebhook(null);
    setSheetOpen(true);
  }

  function openEdit(w: WebhookRecord) {
    setEditingWebhook(w);
    setSheetOpen(true);
  }

  function closeSheet() {
    setSheetOpen(false);
    setEditingWebhook(null);
  }

  return (
    <div className="space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Webhook className="h-6 w-6 text-primary" />
            Webhooks
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            Register HTTP endpoints to receive real-time FieldTrack events.
          </p>
        </div>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="h-4 w-4" />
          Add Webhook
        </Button>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load webhooks: {error.message}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="h-2.5 w-2.5 rounded-full" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-7 w-20" />
              </div>
              <div className="flex gap-2">
                <Skeleton className="h-5 w-20 rounded-full" />
                <Skeleton className="h-5 w-24 rounded-full" />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && (webhooks ?? []).length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/60 bg-muted/20 py-20 gap-4 text-center">
          <div className="rounded-full bg-muted p-4">
            <Webhook className="h-8 w-8 text-muted-foreground/50" />
          </div>
          <div>
            <p className="font-semibold text-foreground">No webhooks registered</p>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm">
              Register an HTTP endpoint to receive real-time events like check-ins,
              expense submissions, and employee updates.
            </p>
          </div>
          <Button onClick={openCreate} variant="outline" className="gap-2 mt-2">
            <Plus className="h-4 w-4" />
            Register your first webhook
          </Button>
        </div>
      )}

      {/* Webhook cards */}
      {!isLoading && (webhooks ?? []).length > 0 && (
        <>
          {/* Summary bar */}
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            <span>
              <span className="font-semibold text-foreground">{webhooks!.length}</span>{" "}
              webhook{webhooks!.length !== 1 ? "s" : ""}
            </span>
            <span>·</span>
            <span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                {webhooks!.filter((w) => w.is_active).length}
              </span>{" "}
              active
            </span>
          </div>

          <AnimatePresence mode="popLayout">
            <div className="space-y-3">
              {webhooks!.map((webhook) => (
                <WebhookCard
                  key={webhook.id}
                  webhook={webhook}
                  onEdit={openEdit}
                  onDelete={setDeletingId}
                />
              ))}
            </div>
          </AnimatePresence>
        </>
      )}

      {/* Global delivery history — shows all org deliveries when no specific webhook is selected */}
      {!isLoading && (webhooks ?? []).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
            All Deliveries
          </h2>
          <DeliveriesPanel webhookId={null} />
        </div>
      )}

      {/* Sheets + Dialogs */}
      <WebhookSheet open={sheetOpen} editing={editingWebhook} onClose={closeSheet} />
      <DeleteWebhookDialog webhookId={deletingId} onClose={() => setDeletingId(null)} />
    </div>
  );
}
