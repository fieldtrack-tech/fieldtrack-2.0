import type { FastifyRequest, FastifyReply } from "fastify";
import { ZodError } from "zod";
import { AppError } from "./errors.js";

// ─── Response shape types ─────────────────────────────────────────────────────

export type SuccessResponse<T> = { success: true; data: T };
export type ErrorResponse = {
  success: false;
  error: string;
  requestId: string;
};
export type ApiResponse<T> = SuccessResponse<T> | ErrorResponse;

// ─── Optional pagination metadata ─────────────────────────────────────────────

/**
 * Optional pagination metadata for list endpoints.
 * Not currently used but available for future enhancement.
 *
 * Usage:
 *   type PaginatedResponse<T> = {
 *     success: true;
 *     data: T[];
 *     meta: PaginationMeta;
 *   };
 */
export type PaginationMeta = {
  page: number;
  limit: number;
  total?: number;
};

// ─── Builder helpers ──────────────────────────────────────────────────────────

export function ok<T>(data: T): SuccessResponse<T> {
  return { success: true, data };
}

export function fail(error: string, requestId: string): ErrorResponse {
  return { success: false, error, requestId };
}

// ─── Unified error handler ────────────────────────────────────────────────────

/**
 * Maps thrown errors to typed HTTP responses.
 *
 * Priority:
 *  1. AppError subclasses  → their statusCode (400 / 401 / 403 / 404)
 *  2. ZodError             → 400 Validation failed
 *  3. Anything else        → 500 Internal server error (logged)
 *
 * Returns never to improve TypeScript flow analysis in controllers.
 */
export function handleError(
  error: unknown,
  request: FastifyRequest,
  reply: FastifyReply,
  context: string,
): never {
  if (error instanceof AppError) {
    void reply.status(error.statusCode).send(fail(error.message, request.id));
    throw error;
  }

  if (error instanceof ZodError) {
    const message = error.issues.map((i) => i.message).join("; ");
    void reply
      .status(400)
      .send(fail(`Validation failed: ${message}`, request.id));
    throw error;
  }

  request.log.error({ err: error }, context);
  void reply.status(500).send(fail("Internal server error", request.id));
  throw error;
}
