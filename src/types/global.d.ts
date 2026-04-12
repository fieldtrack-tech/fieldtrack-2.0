import "fastify";
import type { JwtPayload } from "./jwt.js";
import type { ApiKeyScope } from "../modules/api-keys/api-keys.schema.js";

declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: JwtPayload;
        user: JwtPayload;
    }
}

declare module "fastify" {
    interface FastifyRequest {
        user: JwtPayload; // Authenticated user information
        organizationId: string; // Tenant context
        employeeId?: string; // employees.id resolved from users.id at auth time (undefined for ADMINs)
        authType?: "jwt" | "api_key";
        apiKeyId?: string;
        apiKeyScopes?: ApiKeyScope[];
        // Phase 18: Internal Fastify property for matched route pattern.
        // Used by Prometheus metrics and abuse logging to group requests by route.
        routerPath?: string;
    }
}
