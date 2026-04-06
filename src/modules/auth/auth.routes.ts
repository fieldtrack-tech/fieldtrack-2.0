import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";

const authMeResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    id: z.string().uuid(),
    email: z.string().email().optional(),
    role: z.enum(["ADMIN", "EMPLOYEE"]),
    orgId: z.string().uuid(),
  }),
});

/**
 * Auth routes — identity resolution from JWT.
 *
 * /auth/me returns the authenticated user's claims directly from the verified
 * JWT.  No database query is performed.  This endpoint always succeeds for any
 * request that carries a valid token, decoupling identity from profile state.
 */
export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/auth/me",
    {
      schema: {
        tags: ["auth"],
        response: { 200: authMeResponseSchema.describe("Authenticated user identity") },
      },
      preValidation: [authenticate],
    },
    async (request, reply) => {
      const { sub, email, role, organization_id } = request.user;

      return reply.status(200).send({
        success: true,
        data: {
          id: sub,
          email,
          role,
          orgId: organization_id,
        },
      });
    },
  );
}
