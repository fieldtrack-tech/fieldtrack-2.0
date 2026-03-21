import { Queue } from "bullmq";
import { redisConnectionOptions } from "../config/redis.js";
import { env } from "../config/env.js";
import { QueueOverloadedError } from "../utils/errors.js";
import { queueOverloadEventsTotal } from "../plugins/prometheus.js";

interface DistanceJobData {
  sessionId: string;
}

interface DistanceFailedJobData {
  originalData: DistanceJobData;
  failedAt: string;
  reason: string;
}

// ─── Queue Definition ─────────────────────────────────────────────────────────

/**
 * Phase 10: Durable BullMQ queue replacing the Phase 7 in-memory queue.
 *
 * Benefits over the in-memory approach:
 *  - Jobs survive process restarts (stored in Redis)
 *  - Automatic retry with exponential backoff on failure
 *  - Job deduplication guaranteed by jobId = sessionId
 *  - Horizontally scalable — multiple workers can consume the same queue
 */
const distanceQueue = new Queue("distance-engine", {
  connection: redisConnectionOptions,
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: "exponential",
      delay: 1_000, // 1s → 2s → 4s → 8s → 16s
    },
    removeOnComplete: true,
    removeOnFail: false, // Retain failed jobs for inspection
  },
});

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Enqueue a distance recalculation job for the given session.
 *
 * Idempotent: jobId = sessionId ensures that duplicate enqueue calls
 * for the same session produce only a single job in the queue.
 * BullMQ silently ignores duplicate jobIds that are already waiting.
 */
export async function enqueueDistanceJob(sessionId: string): Promise<void> {
  const [waiting, delayed] = await Promise.all([
    distanceQueue.getWaitingCount(),
    distanceQueue.getDelayedCount(),
  ]);

  const queueDepth = waiting + delayed;
  if (queueDepth >= env.MAX_QUEUE_DEPTH) {
    // Alert hook: emit overload event counter
    queueOverloadEventsTotal.labels("distance-engine").inc();
    throw new QueueOverloadedError("distance-engine", queueDepth, env.MAX_QUEUE_DEPTH);
  }

  await distanceQueue.add(
    "recalculate",
    { sessionId },
    { jobId: sessionId },
  );
}

/**
 * Returns the count of jobs currently waiting in the queue.
 * Used by the metrics registry — decoupled so metrics.ts has no queue import.
 */
export async function getQueueDepth(): Promise<number> {
  return distanceQueue.getWaitingCount();
}

export const distanceFailedQueue = new Queue<DistanceFailedJobData, void, "dead-letter">(
  "distance-failed",
  {
    connection: redisConnectionOptions,
    defaultJobOptions: {
      removeOnComplete: { count: 500 },
      removeOnFail: false,
    },
  },
);

export async function moveDistanceToDeadLetter(
  jobData: DistanceJobData,
  reason: string,
): Promise<void> {
  await distanceFailedQueue.add("dead-letter", {
    originalData: jobData,
    failedAt: new Date().toISOString(),
    reason,
  });
}

export async function replayDistanceDeadLetter(limit = 100): Promise<number> {
  const boundedLimit = Math.max(1, Math.min(500, Math.trunc(limit)));
  const jobs = await distanceFailedQueue.getJobs(
    ["waiting", "delayed", "failed", "completed"],
    0,
    Math.max(0, boundedLimit - 1),
    true,
  );

  let replayed = 0;
  for (const job of jobs) {
    const sessionId = job.data.originalData?.sessionId;
    if (!sessionId) {
      continue;
    }
    await enqueueDistanceJob(sessionId);
    await job.remove();
    replayed++;
  }
  return replayed;
}

export { distanceQueue };
