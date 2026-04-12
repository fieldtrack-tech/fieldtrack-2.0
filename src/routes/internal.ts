import type { FastifyInstance } from "fastify";
import { metrics } from "../utils/metrics.js";
import { getQueueDepth } from "../workers/distance.queue.js";
import { authenticate } from "../middleware/auth.js";
import { requireRole } from "../middleware/role-guard.js";
import { areWorkersStarted } from "../workers/startup.js";

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
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    async (_request, reply): Promise<void> => {
      const queueDepth = await getQueueDepth();
      const snapshot = metrics.snapshot(queueDepth);
      reply.status(200).send(snapshot);
    },
  );

  /**
   * GET /internal/queues/status
   *
   * Returns detailed queue status including depth, active, and delayed job counts.
   * Exposed only on internal network (no external DNS alias) for operator dashboards.
   *
   * Requires: JWT authentication + ADMIN role. No external exposure.
   *
   * NOTE — two queue-status endpoints coexist by design (Option A, REORGANIZATION_PLAN P3-2):
   *   • GET /internal/queues/status  (this endpoint) — Prometheus / operator scrape target.
   *     Minimal contract: { queues: { distance, analytics } } with depth/active/delayed.
   *     Intentionally kept lean for programmatic consumers (alerting rules, scripts).
   *   • GET /admin/queues            — UI-facing endpoint consumed by the admin queue monitor.
   *     Richer contract: includes webhook queue, DLQ depth, combined backlog view.
   * Both endpoints serve different consumers and should NOT be merged.
   *
   * Response shape:
   * {
   *   queues: {
   *     distance: { depth, active, delayed, ...}
   *     analytics: { depth, active, delayed, ... }
   *   }
   * }
   */
  app.get(
    "/internal/queues/status",
    {
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    async (_request, reply): Promise<void> => {
      try {
        const { distanceQueue } = await import("../workers/distance.queue.js");
        const { analyticsQueue } = await import("../workers/analytics.queue.js");

        const [distanceWaiting, distanceActive, distanceDelayed, analyticsWaiting, analyticsActive, analyticsDelayed] =
          await Promise.all([
            distanceQueue.getWaitingCount(),
            distanceQueue.getActiveCount(),
            distanceQueue.getDelayedCount(),
            analyticsQueue.getWaitingCount(),
            analyticsQueue.getActiveCount(),
            analyticsQueue.getDelayedCount(),
          ]);

        reply.status(200).send({
          success: true,
          queues: {
            distance: {
              depth: distanceWaiting,
              active: distanceActive,
              delayed: distanceDelayed,
            },
            analytics: {
              depth: analyticsWaiting,
              active: analyticsActive,
              delayed: analyticsDelayed,
            },
          },
        });
      } catch (error) {
        _request.log.error({ error }, "Failed to fetch queue status");
        reply.status(500).send({
          success: false,
          error: "Failed to fetch queue status",
          requestId: _request.id,
        });
      }
    },
  );

  /**
   * GET /internal/snapshot-health
   *
   * Reports the freshness of each snapshot table.
   * A snapshot is considered "stale" if updated_at is older than 10 minutes —
   * the reconciliation job runs every 5 minutes, so >10 min indicates a jam.
   *
   * Requires: JWT authentication + ADMIN role.
   *
   * Response shape:
   * {
   *   success: true,
   *   data: {
   *     status: "healthy" | "degraded",
   *     tables: {
   *       employee_last_state:       { latestUpdateAt, rowCount, stale }
   *       org_dashboard_snapshot:    { latestUpdateAt, rowCount, stale }
   *       employee_metrics_snapshot: { latestUpdateAt, rowCount, stale }
   *     }
   *   }
   * }
   */
  app.get(
    "/internal/snapshot-health",
    {
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    async (request, reply): Promise<void> => {
      try {
        const { supabaseServiceClient: supabase } = await import("../config/supabase.js");
        const orgId = request.organizationId;
        const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes

        const [elsResult, dashResult, metricsResult] = await Promise.allSettled([
          supabase
            .from("employee_last_state")
            .select("updated_at", { count: "exact", head: false })
            .eq("organization_id", orgId)
            .order("updated_at", { ascending: false })
            .limit(1),
          supabase
            .from("org_dashboard_snapshot")
            .select("updated_at", { count: "exact", head: false })
            .eq("organization_id", orgId)
            .limit(1),
          supabase
            .from("employee_metrics_snapshot")
            .select("updated_at", { count: "exact", head: false })
            .eq("organization_id", orgId)
            .order("updated_at", { ascending: false })
            .limit(1),
        ]);

        const now = Date.now();

        function analyseResult(
          result: PromiseSettledResult<{ data: Array<{ updated_at: string }> | null; count: number | null; error: unknown }>,
        ): { latestUpdateAt: string | null; rowCount: number; stale: boolean; error?: string } {
          if (result.status === "rejected") {
            return { latestUpdateAt: null, rowCount: 0, stale: true, error: String(result.reason) };
          }
          const { data, count } = result.value;
          const latestUpdateAt = data?.[0]?.updated_at ?? null;
          const stale = latestUpdateAt
            ? now - new Date(latestUpdateAt).getTime() > STALE_THRESHOLD_MS
            : true;
          return { latestUpdateAt, rowCount: count ?? 0, stale };
        }

        const tables = {
          employee_last_state: analyseResult(elsResult as PromiseSettledResult<{ data: Array<{ updated_at: string }> | null; count: number | null; error: unknown }>),
          org_dashboard_snapshot: analyseResult(dashResult as PromiseSettledResult<{ data: Array<{ updated_at: string }> | null; count: number | null; error: unknown }>),
          employee_metrics_snapshot: analyseResult(metricsResult as PromiseSettledResult<{ data: Array<{ updated_at: string }> | null; count: number | null; error: unknown }>),
        };

        const anyStale = Object.values(tables).some((t) => t.stale);
        const overallStatus = anyStale ? "degraded" : "healthy";

        const workersHealthy = areWorkersStarted();

        reply.status(anyStale ? 503 : 200).send({
          success: true,
          data: {
            status: overallStatus,
            checkedAt: new Date().toISOString(),
            tables,
            workers: {
              healthy: workersHealthy,
              lastProcessedAt: metrics.lastWorkerJobAt,
            },
          },
        });
      } catch (error) {
        request.log.error({ error }, "Failed to fetch snapshot health");
        reply.status(500).send({
          success: false,
          error: "Failed to fetch snapshot health",
          requestId: request.id,
        });
      }
    },
  );

  /**
   * GET /internal/ready-deep
   *
   * Admin-only deep readiness probe. Checks live connectivity to all three
   * infrastructure dependencies: Redis (via BullMQ ping), Supabase (DB row
   * select), and worker liveness (areWorkersStarted + lastWorkerJobAt).
   *
   * Unlike /ready (public, cached, 3s TTL), this endpoint runs a fresh probe
   * on every call and requires ADMIN auth — it is intended for operator
   * dashboards and on-call runbooks, not for automated load balancers.
   *
   * Response shape:
   * {
   *   success: true,
   *   data: {
   *     status: "healthy" | "degraded",
   *     checkedAt: string,
   *     checks: {
   *       redis:    { status: "ok" | "error", latencyMs: number, error?: string }
   *       database: { status: "ok" | "error", latencyMs: number, error?: string }
   *       workers:  { status: "ok" | "error" | "skipped", healthy: boolean, lastProcessedAt: string | null }
   *     }
   *   }
   * }
   */
  app.get(
    "/internal/ready-deep",
    {
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    async (request, reply): Promise<void> => {
      try {
        const { supabaseServiceClient: supabase } = await import("../config/supabase.js");
        const { distanceQueue } = await import("../workers/distance.queue.js");
        const { shouldStartWorkers } = await import("../workers/startup.js");

        type CheckResult = { status: "ok" | "error"; latencyMs: number; error?: string };

        const [redisResult, dbResult] = await Promise.allSettled([
          (async (): Promise<CheckResult> => {
            const t0 = Date.now();
            const client = await distanceQueue.waitUntilReady();
            await client.ping();
            return { status: "ok", latencyMs: Date.now() - t0 };
          })(),
          (async (): Promise<CheckResult> => {
            const t0 = Date.now();
            const { error } = await supabase
              .from("organizations")
              .select("id")
              .limit(1);
            if (error) throw error;
            return { status: "ok", latencyMs: Date.now() - t0 };
          })(),
        ]);

        const redis: CheckResult = redisResult.status === "fulfilled"
          ? redisResult.value
          : { status: "error", latencyMs: 0, error: String((redisResult as PromiseRejectedResult).reason) };

        const database: CheckResult = dbResult.status === "fulfilled"
          ? dbResult.value
          : { status: "error", latencyMs: 0, error: String((dbResult as PromiseRejectedResult).reason) };

        const workersRunning = areWorkersStarted();
        const workers = {
          status: !shouldStartWorkers()
            ? ("skipped" as const)
            : workersRunning ? ("ok" as const) : ("error" as const),
          healthy: workersRunning,
          lastProcessedAt: metrics.lastWorkerJobAt,
        };

        const allOk = redis.status === "ok" && database.status === "ok" && workers.status !== "error";
        const overallStatus = allOk ? "healthy" : "degraded";

        reply.status(allOk ? 200 : 503).send({
          success: true,
          data: {
            status: overallStatus,
            checkedAt: new Date().toISOString(),
            checks: { redis, database, workers },
          },
        });
      } catch (error) {
        request.log.error({ error }, "Failed to run deep readiness check");
        reply.status(500).send({
          success: false,
          error: "Failed to run deep readiness check",
          requestId: request.id,
        });
      }
    },
  );
}
