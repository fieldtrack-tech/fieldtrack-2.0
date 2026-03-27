/**
 * webhook.queue.ts — BullMQ queue for async webhook delivery.
 *
 * Design follows the existing distance.queue.ts lazy-singleton pattern:
 *  - Queue object is created on first use, not at import time.
 *  - This prevents Redis connections from being opened in CI / test
 *    environments where Redis is not available.
 *
 * Job payload contains everything the worker needs to sign and deliver
 * the request without additional DB round-trips in the hot path.
 */

import { Queue } from "bullmq";
import { getRedisConnectionOptions } from "../config/redis.js";
import { env } from "../config/env.js";
import { QueueOverloadedError } from "../utils/errors.js";

// ─── Job Payload ──────────────────────────────────────────────────────────────

export interface WebhookDeliveryJobData {
  /** Delivery row id in webhook_deliveries — used for idempotent updates */
  delivery_id: string;
  /** Webhook registration id */
  webhook_id: string;
  /** Event row id in webhook_events */
  event_id: string;
  /** Target endpoint URL (HTTPS, already validated at registration) */
  url: string;
  /**
   * Per-webhook signing secret.
   *
   * NOTE: This travels through Redis. In a high-security environment the
   * secret should instead be fetched from the DB inside the worker on each
   * attempt. We accept the Redis-in-transit risk here because the Redis
   * connection is TLS-encrypted in production (rediss://) and the secret is
   * only used for HMAC signing — it does NOT grant DB access.
   */
  secret: string;
  /** Current delivery attempt number (1-based) */
  attempt_number: number;
}

// ─── Queue name constant ──────────────────────────────────────────────────────

export const WEBHOOK_QUEUE_NAME = "webhook-delivery" as const;

// ─── Retry back-off delays (milliseconds) ────────────────────────────────────
//
// Attempt 1 → immediate (delay = 0, handled as first-try in BullMQ)
// Attempt 2 → 30 s
// Attempt 3 → 2 min
// Attempt 4 → 10 min
// Attempt 5 → 1 h
//
// This matches the spec. BullMQ's built-in exponential backoff is not used
// here because the spec defines specific absolute delays (not a geometric
// series), so we supply a custom `delay` per job via the retry handler.

export const WEBHOOK_RETRY_DELAYS_MS: ReadonlyArray<number> = [
  0,          // attempt 1 — immediate
  30_000,     // attempt 2 — 30 s
  120_000,    // attempt 3 — 2 min
  600_000,    // attempt 4 — 10 min
  3_600_000,  // attempt 5 — 1 h
];

export const WEBHOOK_MAX_ATTEMPTS = WEBHOOK_RETRY_DELAYS_MS.length;

/**
 * Calculate retry delay with ±10% jitter to prevent thundering herd.
 *
 * Without jitter, 100 failed deliveries all retry at the same time,
 * creating a synchronized spike that can cascade. Jitter spreads retries
 * across a window, stabilizing the system.
 *
 * Example: baseDelay=30s → 27-33s range (±10% jitter)
 *
 * @param attemptNumber 1-based attempt number (1=first retry, 2=second, etc.)
 * @returns delay in milliseconds for this retry
 */
export function calculateRetryDelay(attemptNumber: number): number {
  const baseDelay = WEBHOOK_RETRY_DELAYS_MS[attemptNumber - 1];
  // ±10% jitter: add/subtract up to 10% of base delay
  const jitterRange = baseDelay * 0.1;
  const jitterMs = jitterRange * (Math.random() * 2 - 1); // [-jitterRange, +jitterRange]
  return Math.round(baseDelay + jitterMs);
}

// ─── Lazy Queue Singleton ─────────────────────────────────────────────────────

let _webhookQueue: Queue<WebhookDeliveryJobData> | undefined;

function getWebhookQueue(): Queue<WebhookDeliveryJobData> {
  if (_webhookQueue) return _webhookQueue;

  _webhookQueue = new Queue<WebhookDeliveryJobData>(WEBHOOK_QUEUE_NAME, {
    connection: getRedisConnectionOptions(),
    defaultJobOptions: {
      // Each job is attempted once by BullMQ — retry scheduling is managed
      // manually by the worker so we can record attempt state in the DB and
      // implement exact delays without relying on BullMQ's built-in backoff.
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: { count: 500 },
    },
  });

  return _webhookQueue;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue a webhook delivery job.
 *
 * The job ID is `delivery:{delivery_id}:{attempt_number}` to ensure
 * each attempt is a distinct job while allowing the delivery_id to
 * correlate all attempts for a single delivery row.
 *
 * @throws {QueueOverloadedError} when the queue depth exceeds MAX_QUEUE_DEPTH.
 */
export async function enqueueWebhookDelivery(
  data: WebhookDeliveryJobData,
  delayMs = 0,
): Promise<void> {
  const queue = getWebhookQueue();

  const [waiting, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getDelayedCount(),
  ]);

  const depth = waiting + delayed;
  if (depth >= env.MAX_QUEUE_DEPTH) {
    throw new QueueOverloadedError(WEBHOOK_QUEUE_NAME, depth, env.MAX_QUEUE_DEPTH);
  }

  await queue.add(
    "deliver",
    data,
    {
      jobId: `delivery:${data.delivery_id}:${data.attempt_number}`,
      delay: delayMs,
    },
  );
}

/**
 * Return the combined waiting + delayed count.
 * Exposed for metrics and admin health checks.
 */
export async function getWebhookQueueDepth(): Promise<number> {
  const queue = getWebhookQueue();
  const [waiting, delayed] = await Promise.all([
    queue.getWaitingCount(),
    queue.getDelayedCount(),
  ]);
  return waiting + delayed;
}
