import type { FastifyInstance } from "fastify";
import { metrics } from "../utils/metrics.js";
import { getQueueDepth } from "../workers/distance.queue.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role-guard.js";

/**
 * Internal observability routes.
 *
 * Phase 8: All internal routes are now protected by JWT authentication and
 * require the ADMIN role. This prevents unauthenticated access regardless of
 * network topology — no reliance on IP filtering.
 */
export async function internalRoutes(app: FastifyInstance): Promise<void> {
  /**
   * GET /internal/metrics
   *
   * Returns a structured JSON snapshot of the process's current operational
   * state. All values are point-in-time readings — no aggregation window.
   *
   * Requires: JWT authentication + ADMIN role.
   *
   * Response shape:
   * {
   *   uptimeSeconds:          number   — seconds since the process started
   *   queueDepth:             number   — sessions currently waiting in the worker queue
   *   totalRecalculations:    number   — cumulative completed distance recalculations
   *   totalLocationsInserted: number   — cumulative GPS points written (deduped)
   *   avgRecalculationMs:     number   — rolling average recalculation latency (last 100 jobs)
   * }
   */
  app.get(
    "/internal/metrics",
    {
      preHandler: [authenticate, requireRole("ADMIN")],
    },
    async (_request, reply): Promise<void> => {
      const queueDepth = await getQueueDepth();
      const snapshot = metrics.snapshot(queueDepth);
      reply.status(200).send(snapshot);
    },
  );
}
