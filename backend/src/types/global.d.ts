import "fastify";
import type { JwtPayload } from "./jwt.js";

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
        // Phase 18: Internal Fastify property for matched route pattern.
        // Used by Prometheus metrics and abuse logging to group requests by route.
        routerPath?: string;
    }
}
