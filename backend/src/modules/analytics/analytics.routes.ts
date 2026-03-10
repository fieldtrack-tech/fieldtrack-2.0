import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { analyticsController } from "./analytics.controller.js";

/**
 * Analytics routes — all endpoints require JWT authentication + ADMIN role.
 *
 * EMPLOYEE tokens receive 403. Missing/invalid tokens receive 401.
 * No analytics data is ever exposed to non-admin identities.
 */
export async function analyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/admin/org-summary",
    {
      schema: { tags: ["admin"] },
      preHandler: [authenticate, requireRole("ADMIN")],
    },
    analyticsController.getOrgSummary,
  );

  app.get(
    "/admin/user-summary",
    {
      schema: { tags: ["admin"] },
      preHandler: [authenticate, requireRole("ADMIN")],
    },
    analyticsController.getUserSummary,
  );

  app.get(
    "/admin/top-performers",
    {
      schema: { tags: ["admin"] },
      preHandler: [authenticate, requireRole("ADMIN")],
    },
    analyticsController.getTopPerformers,
  );
}
