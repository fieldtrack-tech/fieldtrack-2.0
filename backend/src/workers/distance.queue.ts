import { Queue } from "bullmq";
import { redisConnectionOptions } from "../config/redis.js";

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

export { distanceQueue };
