import type { FastifyRequest, FastifyReply } from "fastify";
import type { JwtPayload } from "../types/jwt.js";
import { ForbiddenError } from "../utils/errors.js";

/**
 * Creates a preHandler hook that enforces a specific role.
 * Must be used AFTER the authenticate middleware.
 *
 * Usage in routes:
 *   app.get("/admin-only", { preHandler: [authenticate, requireRole("ADMIN")] }, handler);
 */
export function requireRole(role: JwtPayload["role"]) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if (request.user.role !== role) {
            const err = new ForbiddenError(`This action requires ${role} role`);
            reply.status(err.statusCode).send({ error: err.message });
        }
    };
}
