import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { authenticate, requireJwtAuth } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { apiKeysController } from "./api-keys.controller.js";
import { apiKeyCreateBodySchema, apiKeyPublicSchema, apiKeyUpdateBodySchema } from "./api-keys.schema.js";

const apiKeyCreateResponseSchema = z.object({
  success: z.literal(true),
  data: z.object({
    key: z.string(),
    record: apiKeyPublicSchema,
  }),
});

const apiKeyListResponseSchema = z.object({
  success: z.literal(true),
  data: z.array(apiKeyPublicSchema),
});

const apiKeySingleResponseSchema = z.object({
  success: z.literal(true),
  data: apiKeyPublicSchema,
});

export async function apiKeysRoutes(app: FastifyInstance): Promise<void> {
  app.post(
    "/admin/api-keys",
    {
      schema: {
        tags: ["admin", "api-keys"],
        summary: "Create API key (raw key returned only once)",
        body: apiKeyCreateBodySchema,
        response: { 201: apiKeyCreateResponseSchema },
      },
      preValidation: [authenticate, requireJwtAuth, requireRole("ADMIN")],
    },
    apiKeysController.create,
  );

  app.get(
    "/admin/api-keys",
    {
      schema: {
        tags: ["admin", "api-keys"],
        summary: "List API keys for organization",
        response: { 200: apiKeyListResponseSchema },
      },
      preValidation: [authenticate, requireJwtAuth, requireRole("ADMIN")],
    },
    apiKeysController.list,
  );

  app.patch<{ Params: { id: string } }>(
    "/admin/api-keys/:id",
    {
      schema: {
        tags: ["admin", "api-keys"],
        summary: "Update API key metadata, scopes or active state",
        params: z.object({ id: z.string().uuid() }),
        body: apiKeyUpdateBodySchema,
        response: { 200: apiKeySingleResponseSchema },
      },
      preValidation: [authenticate, requireJwtAuth, requireRole("ADMIN")],
    },
    apiKeysController.update,
  );

  app.delete<{ Params: { id: string } }>(
    "/admin/api-keys/:id",
    {
      schema: {
        tags: ["admin", "api-keys"],
        summary: "Delete API key",
        params: z.object({ id: z.string().uuid() }),
        response: { 204: z.null().describe("No content") },
      },
      preValidation: [authenticate, requireJwtAuth, requireRole("ADMIN")],
    },
    apiKeysController.remove,
  );
}
