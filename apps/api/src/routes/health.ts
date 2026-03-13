import type { FastifyInstance } from "fastify";

interface HealthResponse {
    status: string;
    timestamp: string;
}

interface RootResponse {
    service: string;
    status: string;
    version: string;
    docs: string;
}

export async function healthRoutes(app: FastifyInstance): Promise<void> {
    // Root — service identity probe.
    // Previously served by Nginx as a static response; now handled by Fastify
    // so the response goes through the same middleware chain as all other routes.
    app.get<{ Reply: RootResponse }>("/", {
        schema: { tags: ["health"] },
    }, async (_request, _reply) => {
        return {
            service: "FieldTrack 2.0",
            status: "online",
            version: "1.0.0",
            docs: "/docs",
        };
    });

    app.get<{ Reply: HealthResponse }>("/health", {
        schema: { tags: ["health"] },
    }, async (_request, _reply) => {
        return {
            status: "ok",
            timestamp: new Date().toISOString(),
        };
    });
}
