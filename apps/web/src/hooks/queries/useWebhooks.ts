"use client";

import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { apiGet, apiGetPaginated, apiPost, apiPatch, apiDelete } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import type { PaginatedResponse } from "@/types";

// ─── Types ────────────────────────────────────────────────────────────────────

export const WEBHOOK_EVENT_TYPES = [
  "employee.checked_in",
  "employee.checked_out",
  "expense.created",
  "expense.approved",
  "expense.rejected",
  "employee.created",
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

export interface WebhookRecord {
  id: string;
  organization_id: string;
  url: string;
  is_active: boolean;
  events: WebhookEventType[];
  created_at: string;
  updated_at: string;
}

export type DeliveryStatus = "pending" | "success" | "failed";

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  event_id: string;
  organization_id: string;
  status: DeliveryStatus;
  attempt_count: number;
  response_status: number | null;
  response_body: string | null;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  created_at: string;
}

export interface CreateWebhookBody {
  url: string;
  events: WebhookEventType[];
  secret: string;
}

export interface UpdateWebhookBody {
  url?: string;
  events?: WebhookEventType[];
  is_active?: boolean;
  secret?: string;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/** List all webhooks for the org. */
export function useWebhooks() {
  return useQuery<WebhookRecord[]>({
    queryKey: ["webhooks"],
    queryFn: () => apiGet<WebhookRecord[]>(API.webhooks),
    staleTime: 30_000,
  });
}

/** Paginated delivery history, optionally filtered by webhookId or status. */
export function useWebhookDeliveries(
  page: number,
  limit: number,
  webhookId?: string,
  status?: DeliveryStatus
) {
  return useQuery<PaginatedResponse<WebhookDelivery>>({
    queryKey: ["webhookDeliveries", page, limit, webhookId, status],
    queryFn: () => {
      const params: Record<string, string> = {
        page: String(page),
        limit: String(limit),
      };
      if (webhookId) params["webhook_id"] = webhookId;
      if (status) params["status"] = status;
      return apiGetPaginated<WebhookDelivery>(API.webhookDeliveries, params);
    },
    staleTime: 15_000,         // deliveries: refresh more frequently
    placeholderData: keepPreviousData,
  });
}

// ─── Mutations ────────────────────────────────────────────────────────────────

/** Register a new webhook endpoint. */
export function useCreateWebhook() {
  const client = useQueryClient();
  return useMutation<WebhookRecord, Error, CreateWebhookBody>({
    mutationFn: (body) => apiPost<WebhookRecord>(API.webhooks, body),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

/** Update a webhook's URL, events, active state, or secret. */
export function useUpdateWebhook(id: string) {
  const client = useQueryClient();
  return useMutation<WebhookRecord, Error, UpdateWebhookBody>({
    mutationFn: (body) => apiPatch<WebhookRecord>(API.webhookById(id), body),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["webhooks"] }),
  });
}

/** Delete a webhook and all its delivery history. */
export function useDeleteWebhook() {
  const client = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => apiDelete(API.webhookById(id)),
    onSuccess: () => {
      void client.invalidateQueries({ queryKey: ["webhooks"] });
      void client.invalidateQueries({ queryKey: ["webhookDeliveries"] });
    },
  });
}

/** Manually retry a failed (or succeeded) delivery. */
export function useRetryDelivery() {
  const client = useQueryClient();
  return useMutation<WebhookDelivery, Error, string>({
    mutationFn: (deliveryId) =>
      apiPost<WebhookDelivery>(API.retryDelivery(deliveryId), {}),
    onSuccess: () =>
      void client.invalidateQueries({ queryKey: ["webhookDeliveries"] }),
  });
}
