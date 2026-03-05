import type { FastifyRequest, FastifyReply } from "fastify";
import { expensesService } from "./expenses.service.js";
import {
  createExpenseBodySchema,
  updateExpenseStatusBodySchema,
  expensePaginationSchema,
} from "./expenses.schema.js";
import { AppError } from "../../utils/errors.js";

/**
 * Expenses controller — parses/validates request data, delegates to service,
 * returns consistent { success, data } responses.
 */
export const expensesController = {
  /**
   * POST /expenses
   * Creates a new expense for the authenticated employee.
   */
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const parsed = createExpenseBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => i.message)
          .join("; ");
        reply.status(400).send({ success: false, error: `Validation failed: ${issues}`, requestId: request.id });
        return;
      }

      const expense = await expensesService.createExpense(request, parsed.data);
      reply.status(201).send({ success: true, data: expense });
    } catch (error) {
      if (error instanceof AppError) {
        reply.status(error.statusCode).send({ success: false, error: error.message, requestId: request.id });
        return;
      }
      request.log.error(error, "Unexpected error creating expense");
      reply.status(500).send({ success: false, error: "Internal server error", requestId: request.id });
    }
  },

  /**
   * GET /expenses/my
   * Returns the authenticated employee's own expenses (paginated).
   */
  async getMy(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const parsed = expensePaginationSchema.parse(request.query);
      const expenses = await expensesService.getMyExpenses(
        request,
        parsed.page,
        parsed.limit,
      );
      reply.status(200).send({ success: true, data: expenses });
    } catch (error) {
      if (error instanceof AppError) {
        reply.status(error.statusCode).send({ success: false, error: error.message, requestId: request.id });
        return;
      }
      request.log.error(error, "Unexpected error fetching user expenses");
      reply.status(500).send({ success: false, error: "Internal server error", requestId: request.id });
    }
  },

  /**
   * GET /admin/expenses
   * Returns all expenses across the organization (ADMIN only, paginated).
   */
  async getOrgAll(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const parsed = expensePaginationSchema.parse(request.query);
      const expenses = await expensesService.getOrgExpenses(
        request,
        parsed.page,
        parsed.limit,
      );
      reply.status(200).send({ success: true, data: expenses });
    } catch (error) {
      if (error instanceof AppError) {
        reply.status(error.statusCode).send({ success: false, error: error.message, requestId: request.id });
        return;
      }
      request.log.error(error, "Unexpected error fetching org expenses");
      reply.status(500).send({ success: false, error: "Internal server error", requestId: request.id });
    }
  },

  /**
   * PATCH /admin/expenses/:id
   * Approve or reject a PENDING expense (ADMIN only).
   */
  async updateStatus(
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ): Promise<void> {
    try {
      const { id } = request.params;

      const parsed = updateExpenseStatusBodySchema.safeParse(request.body);
      if (!parsed.success) {
        const issues = parsed.error.issues
          .map((i) => i.message)
          .join("; ");
        reply.status(400).send({ success: false, error: `Validation failed: ${issues}`, requestId: request.id });
        return;
      }

      const expense = await expensesService.updateExpenseStatus(
        request,
        id,
        parsed.data,
      );
      reply.status(200).send({ success: true, data: expense });
    } catch (error) {
      if (error instanceof AppError) {
        reply.status(error.statusCode).send({ success: false, error: error.message, requestId: request.id });
        return;
      }
      request.log.error(error, "Unexpected error updating expense status");
      reply.status(500).send({ success: false, error: "Internal server error", requestId: request.id });
    }
  },
};
