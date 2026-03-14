import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { expensesController } from "./expenses.controller.js";
import { expensesRepository } from "./expenses.repository.js";
import { handleError, paginated } from "../../utils/response.js";
import {
  createExpenseBodySchema,
  expensePaginationSchema,
  updateExpenseStatusBodySchema,
} from "./expenses.schema.js";

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
      schema: { tags: ["expenses"], body: createExpenseBodySchema },
      config: {
        rateLimit: {
          max: 10,
          timeWindow: 60_000,
          keyGenerator: (req: FastifyRequest): string => req.user?.sub ?? req.ip,
        },
      },
      // No role restriction — admins who also have an employee record can submit
      // expenses. The service layer's requireEmployeeContext() guard rejects any
      // authenticated user who has no employees row (403).
      preValidation: [authenticate],
    },
    expensesController.create,
  );

  app.get(
    "/expenses/my",
    {
      schema: {
        tags: ["expenses"],
        querystring: expensePaginationSchema,
      },
      // No role restriction — service returns [] when employeeId is absent (admin users)
      preValidation: [authenticate],
    },
    expensesController.getMy,
  );

  app.get(
    "/admin/expenses",
    {
      schema: {
        tags: ["admin"],
        querystring: expensePaginationSchema,
      },
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    expensesController.getOrgAll,
  );

  app.patch<{ Params: { id: string } }>(
    "/admin/expenses/:id",
    {
      schema: { tags: ["admin"], body: updateExpenseStatusBodySchema },
      // preValidation ensures auth/role fires before body validation
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    expensesController.updateStatus,
  );

  /**
   * GET /admin/expenses/summary
   *
   * Returns one aggregated row per employee instead of individual expense records.
   * Drastically reduces payload size for orgs with hundreds of expenses.
   *
   * Each row contains:
   *  - pendingCount / pendingAmount  — actionable backlog
   *  - totalCount  / totalAmount     — lifetime totals
   *  - latestExpenseDate             — for recency sorting
   *
   * Sorted: employees with ≥1 pending expense first, then by latest date DESC.
   */
  app.get(
    "/admin/expenses/summary",
    {
      schema: {
        tags: ["admin"],
        querystring: z.object({
          page: z.coerce.number().int().min(1).default(1),
          limit: z.coerce.number().int().min(1).max(1000).default(50),
        }),
      },
      preValidation: [authenticate, requireRole("ADMIN")],
    },
    async (request, reply) => {
      try {
        const { page, limit } = request.query as { page: number; limit: number };
        const result = await expensesRepository.findExpenseSummaryByEmployee(
          request,
          page,
          limit,
        );
        reply.status(200).send(paginated(result.data, page, limit, result.total));
      } catch (error) {
        handleError(error, request, reply, "Unexpected error fetching expense summary");
      }
    },
  );
}
