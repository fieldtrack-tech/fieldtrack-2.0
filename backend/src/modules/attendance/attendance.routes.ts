import type { FastifyInstance, FastifyRequest } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { attendanceController } from "./attendance.controller.js";
import { sessionSummaryController } from "../session_summary/session_summary.controller.js";

/**
 * Attendance routes — all endpoints require authentication.
 * ADMIN-only routes use the requireRole middleware.
 */
export async function attendanceRoutes(app: FastifyInstance): Promise<void> {
  // Check in — any authenticated user
  app.post(
    "/attendance/check-in",
    {
      schema: { tags: ["attendance"] },
      preHandler: [authenticate],
    },
    attendanceController.checkIn,
  );

  // Check out — any authenticated user
  app.post(
    "/attendance/check-out",
    {
      schema: { tags: ["attendance"] },
      preHandler: [authenticate],
    },
    attendanceController.checkOut,
  );

  // Recalculate distance and duration explicitly.
  // Rate-limited per user (JWT sub) to prevent recalculation flooding.
  app.post<{ Params: { sessionId: string } }>(
    "/attendance/:sessionId/recalculate",
    {
      schema: { tags: ["attendance"] },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 60_000,
          keyGenerator: (req: FastifyRequest): string => {
            const auth = req.headers.authorization;
            if (auth && auth.startsWith("Bearer ")) {
              try {
                const base64Url = auth.split(".")[1];
                if (!base64Url) return req.ip;
                const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                const payload = JSON.parse(
                  Buffer.from(base64, "base64").toString("utf8"),
                ) as Record<string, unknown>;
                const sub = payload["sub"];
                return typeof sub === "string" && sub.length > 0
                  ? `recalc:${sub}`
                  : req.ip;
              } catch {
                return req.ip;
              }
            }
            return req.ip;
          },
        },
      },
      preHandler: [authenticate],
    },
    sessionSummaryController.recalculate,
  );

  // My sessions — employee's own sessions
  app.get(
    "/attendance/my-sessions",
    {
      schema: { tags: ["attendance"] },
      preHandler: [authenticate],
    },
    attendanceController.getMySessions,
  );

  // Org sessions — ADMIN only
  app.get(
    "/attendance/org-sessions",
    {
      schema: { tags: ["admin"] },
      preHandler: [authenticate, requireRole("ADMIN")],
    },
    attendanceController.getOrgSessions,
  );
}
