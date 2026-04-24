import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate } from "../../middleware/auth.js";
import { supabaseAnonClient } from "../../config/supabase.js";
import { fail, ok } from "../../utils/response.js";

const authLoginBodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const authLoginResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    access_token: z.string(),
    refresh_token: z.string().nullable(),
    token_type: z.string(),
    expires_in: z.number().int(),
    expires_at: z.number().nullable(),
  }),
});

const authErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  requestId: z.string(),
  code: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

const authMeResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    // sub can be a UUID (JWT) or "api_key:<uuid>" (API key auth) — accept both
    id: z.string(),
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
  app.post(
    "/auth/login",
    {
      schema: {
        tags: ["auth"],
        body: authLoginBodySchema,
        response: {
          200: authLoginResponseSchema.describe("Authenticated Supabase session"),
          400: authErrorResponseSchema,
          401: authErrorResponseSchema,
        },
      },
    },
    async (request, reply) => {
      const parsed = authLoginBodySchema.safeParse(request.body);
      if (!parsed.success) {
        return reply
          .status(400)
          .send(fail("Validation failed: email and password are required", request.id, "VALIDATION_ERROR"));
      }

      const { data, error } = await supabaseAnonClient.auth.signInWithPassword({
        email: parsed.data.email,
        password: parsed.data.password,
      });

      if (error || !data.session?.access_token) {
        return reply
          .status(401)
          .send(fail("Invalid email or password", request.id, "INVALID_CREDENTIALS"));
      }

      return reply.status(200).send(
        ok({
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
          token_type: data.session.token_type,
          expires_in: data.session.expires_in,
          expires_at: data.session.expires_at ?? null,
        }),
      );
    },
  );

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
