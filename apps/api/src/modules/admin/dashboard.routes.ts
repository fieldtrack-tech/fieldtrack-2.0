import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { supabaseServiceClient as supabase } from "../../config/supabase.js";
import { ok, handleError } from "../../utils/response.js";
import { analyticsService } from "../analytics/analytics.service.js";
import { getCached } from "../../utils/cache.js";
import type { AdminDashboardData } from "@fieldtrack/types";

// Phase 24: Simplified TTL — the snapshot is always current within a worker
// cycle (~seconds), so Redis just absorbs repeated polling load.
const DASHBOARD_CACHE_TTL = 60;

// Shape of a row returned from org_dashboard_snapshot.
interface DashboardSnapshot {
  active_employee_count: number;
  recent_employee_count: number;
  inactive_employee_count: number;
  active_employees_today: number;
  today_session_count: number;
  today_distance_km: number;
  pending_expense_count: number;
  pending_expense_amount: number;
}

// ─── Route registration ───────────────────────────────────────────────────────

/**
 * GET /admin/dashboard
 *
 * Phase 24: O(1) database access.
 *
 * Hot path (cache hit): zero DB queries — serve from Redis in < 1 ms.
 *
 * Cold path (cache miss):
 *   1. ONE indexed primary-key lookup → org_dashboard_snapshot
 *   2. Session trend  (separate Redis cache, 5-min TTL)
 *   3. Leaderboard    (separate Redis cache, 5-min TTL)
 *
 * The snapshot is kept current by the analytics worker, which upserts a row
 * after every session checkout.  The Redis layer (60 s) absorbs high-frequency
 * polling.  Cache invalidation is handled by invalidateOrgAnalytics() which now
 * also clears the `org:{id}:dashboard` key.
 */
export async function adminDashboardRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/admin/dashboard",
    {
      schema: {
        tags: ["admin"],
      },
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    async (request, reply) => {
      try {
        const orgId = request.organizationId;
        const todayDateStr = new Date().toISOString().substring(0, 10);
        const sevenDaysAgo = new Date(`${todayDateStr}T00:00:00Z`);
        sevenDaysAgo.setUTCDate(sevenDaysAgo.getUTCDate() - 7);
        const thirtyDaysAgo = new Date(`${todayDateStr}T00:00:00Z`);
        thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30);

        // Phase 24 cache key — covered by invalidateOrgAnalytics() which also
        // deletes this key. Short TTL of 60 s absorbs load between worker cycles.
        const result = await getCached<AdminDashboardData>(
          `org:${orgId}:dashboard`,
          DASHBOARD_CACHE_TTL,
          async () => {
            // ── ONE DB query: primary-key lookup on org_dashboard_snapshot ──────
            const { data: snapshotData, error: snapshotError } = await supabase
              .from("org_dashboard_snapshot")
              .select(
                "active_employee_count, recent_employee_count, inactive_employee_count, " +
                "active_employees_today, today_session_count, today_distance_km, " +
                "pending_expense_count, pending_expense_amount",
              )
              .eq("organization_id", orgId)
              .maybeSingle();

            if (snapshotError) {
              throw new Error(
                `Dashboard: snapshot query failed: ${snapshotError.message}`,
              );
            }

            const snap = snapshotData as DashboardSnapshot | null;

            // ── Two analytics calls (each independently Redis-cached at 5 min) ─
            const [sessionTrend, leaderboard] = await Promise.all([
              analyticsService.getSessionTrend(
                request,
                sevenDaysAgo.toISOString(),
                undefined,
              ),
              analyticsService.getLeaderboard(
                request,
                "distance",
                thirtyDaysAgo.toISOString(),
                undefined,
                5,
              ),
            ]);

            return {
              activeEmployeeCount:    snap?.active_employee_count    ?? 0,
              recentEmployeeCount:    snap?.recent_employee_count    ?? 0,
              inactiveEmployeeCount:  snap?.inactive_employee_count  ?? 0,
              activeEmployeesToday:   snap?.active_employees_today   ?? 0,
              todaySessionCount:      snap?.today_session_count      ?? 0,
              todayDistanceKm:        snap?.today_distance_km        ?? 0,
              pendingExpenseCount:    snap?.pending_expense_count    ?? 0,
              pendingExpenseAmount:   Number(snap?.pending_expense_amount ?? 0),
              sessionTrend,
              leaderboard,
            } satisfies AdminDashboardData;
          },
        );

        reply.status(200).send(ok(result));
      } catch (error) {
        handleError(error, request, reply, "Unexpected error fetching admin dashboard");
      }
    },
  );
}
