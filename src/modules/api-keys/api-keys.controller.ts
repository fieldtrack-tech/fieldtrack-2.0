import type { FastifyReply, FastifyRequest } from "fastify";
import { handleError, ok } from "../../utils/response.js";
import { apiKeysService } from "./api-keys.service.js";
import { apiKeyCreateBodySchema, apiKeyUpdateBodySchema } from "./api-keys.schema.js";

export const apiKeysController = {
  async create(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const body = apiKeyCreateBodySchema.parse(request.body);
      const result = await apiKeysService.createKey(request, body);
      reply.status(201).send(ok(result));
    } catch (error) {
      handleError(error, request, reply, "Failed to create API key");
    }
  },

  async list(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const rows = await apiKeysService.listKeys(request);
      reply.status(200).send(ok(rows));
    } catch (error) {
      handleError(error, request, reply, "Failed to list API keys");
    }
  },

  async update(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const body = apiKeyUpdateBodySchema.parse(request.body);
      const { id } = request.params;
      const row = await apiKeysService.updateKey(request, id, body);
      reply.status(200).send(ok(row));
    } catch (error) {
      handleError(error, request, reply, "Failed to update API key");
    }
  },

  async remove(request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply): Promise<void> {
    try {
      const { id } = request.params;
      await apiKeysService.deleteKey(request, id);
      reply.status(204).send();
    } catch (error) {
      handleError(error, request, reply, "Failed to delete API key");
    }
  },
};
