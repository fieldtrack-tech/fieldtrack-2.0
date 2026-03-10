export class AppError extends Error {
    public readonly statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.name = "AppError";
        this.statusCode = statusCode;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class UnauthorizedError extends AppError {
    constructor(message = "Unauthorized") {
        super(message, 401);
        this.name = "UnauthorizedError";
    }
}

export class NotFoundError extends AppError {
    constructor(message = "Resource not found") {
        super(message, 404);
        this.name = "NotFoundError";
    }
}

export class BadRequestError extends AppError {
    constructor(message = "Bad request") {
        super(message, 400);
        this.name = "BadRequestError";
    }
}

export class ForbiddenError extends AppError {
    constructor(message = "Forbidden") {
        super(message, 403);
        this.name = "ForbiddenError";
    }
}

// ─── Domain-specific errors ───────────────────────────────────────────────────

export class EmployeeAlreadyCheckedIn extends BadRequestError {
    constructor() {
        super(
            "Cannot check in: you already have an active session. Check out first.",
        );
        this.name = "EmployeeAlreadyCheckedIn";
    }
}

export class SessionAlreadyClosed extends BadRequestError {
    constructor() {
        super("Cannot check out: no active session found. Check in first.");
        this.name = "SessionAlreadyClosed";
    }
}

export class ExpenseAlreadyReviewed extends BadRequestError {
    constructor(currentStatus: string) {
        super(
            `Expense has already been ${currentStatus.toLowerCase()}. Only PENDING expenses can be actioned.`,
        );
        this.name = "ExpenseAlreadyReviewed";
    }
}

// ─── Request context guards ───────────────────────────────────────────────────

import type { FastifyRequest } from "fastify";

/**
 * Asserts that the request carries a resolved employee identity.
 * Throws ForbiddenError (403) if not — which happens when an ADMIN token
 * (no employees row) hits an employee-only endpoint.
 *
 * Also acts as a type narrowing assertion: after this call,
 * `request.employeeId` is guaranteed to be `string`, not `string | undefined`.
 */
export function requireEmployeeContext(
    request: FastifyRequest,
): asserts request is FastifyRequest & { employeeId: string } {
    if (!request.employeeId) {
        throw new ForbiddenError(
            "Employee context required. This endpoint is for employees only.",
        );
    }
}
