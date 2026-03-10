import type { FastifyInstance, FastifyRequest } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { expensesController } from "./expenses.controller.js";

/**
 * Expense routes.
 *
 * EMPLOYEE endpoints:
 *   POST  /expenses          — create a new expense (rate-limited per user)
 *   GET   /expenses/my       — list own expenses (paginated)
 *
 * ADMIN endpoints:
 *   GET   /admin/expenses    — list all org expenses (paginated)
 *   PATCH /admin/expenses/:id — approve or reject a PENDING expense
 */
export async function expensesRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/expenses",
    {
      schema: { tags: ["expenses"] },
      config: {
        rateLimit: {
          max: 10,
          timeWindow: 60_000,
          keyGenerator: (req: FastifyRequest): string => {
            const auth = req.headers.authorization;
            if (auth && auth.startsWith("Bearer ")) {
              try {
                const base64Url = auth.split(".")[1];
                if (!base64Url) return req.ip;
                const base64 = base64Url
                  .replace(/-/g, "+")
                  .replace(/_/g, "/");
                const payload = JSON.parse(
                  Buffer.from(base64, "base64").toString("utf8"),
                ) as Record<string, unknown>;
                const sub = payload["sub"];
                return typeof sub === "string" && sub.length > 0
                  ? `expense-create:${sub}`
                  : req.ip;
              } catch {
                return req.ip;
              }
            }
            return req.ip;
          },
        },
      },
      preHandler: [authenticate, requireRole("EMPLOYEE")],
    },
    expensesController.create,
  );

  app.get(
    "/expenses/my",
    {
      schema: { tags: ["expenses"] },
      preHandler: [authenticate, requireRole("EMPLOYEE")],
    },
    expensesController.getMy,
  );

  app.get(
    "/admin/expenses",
    {
      schema: { tags: ["admin"] },
      preHandler: [authenticate, requireRole("ADMIN")],
    },
    expensesController.getOrgAll,
  );

  app.patch<{ Params: { id: string } }>(
    "/admin/expenses/:id",
    {
      schema: { tags: ["admin"] },
      preHandler: [authenticate, requireRole("ADMIN")],
    },
    expensesController.updateStatus,
  );
}
