import type { FastifyInstance, FastifyRequest } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { attendanceController } from "./attendance.controller.js";
import { sessionSummaryController } from "../session_summary/session_summary.controller.js";
import { paginationSchema, orgSessionsQuerySchema } from "./attendance.schema.js";

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
      preValidation: [authenticate],
    },
    attendanceController.checkIn,
  );

  // Check out — any authenticated user
  app.post(
    "/attendance/check-out",
    {
      schema: { tags: ["attendance"] },
      preValidation: [authenticate],
    },
    attendanceController.checkOut,
  );

  // Recalculate distance and duration explicitly.
  // Rate-limited per IP to prevent recalculation flooding.
  app.post<{ Params: { sessionId: string } }>(
    "/attendance/:sessionId/recalculate",
    {
      schema: { tags: ["attendance"] },
      config: {
        rateLimit: {
          max: 5,
          timeWindow: 60_000,
          keyGenerator: (req: FastifyRequest): string => req.user?.sub ?? req.ip,
        },
      },
      preValidation: [authenticate],
    },
    sessionSummaryController.recalculate,
  );

  // My sessions — employee's own sessions
  app.get(
    "/attendance/my-sessions",
    {
      schema: {
        tags: ["attendance"],
        querystring: paginationSchema,

      },
      // preValidation ensures 401 fires before querystring validation
      preValidation: [authenticate],
    },
    attendanceController.getMySessions,
  );

  // Org sessions — ADMIN only
  // @deprecated Use GET /admin/sessions instead.
  app.get(
    "/attendance/org-sessions",
    {
      schema: {
        tags: ["deprecated"],
        description: "Deprecated: use GET /admin/sessions",
        querystring: orgSessionsQuerySchema,

      },
      // preValidation ensures 401/403 fires before querystring validation
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    attendanceController.getOrgSessions,
  );
}
