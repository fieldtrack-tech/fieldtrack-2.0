import type { FastifyInstance, FastifyRequest } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { locationsController } from "./locations.controller.js";

/**
 * Location routes — endpoints for ingesting and retrieving GPS tracks.
 */
export async function locationsRoutes(app: FastifyInstance): Promise<void> {
    // Ingest location — EMPLOYEE only
    app.post(
        "/locations",
        {
            schema: { tags: ["locations"] },
            config: {
                rateLimit: {
                    max: 10,
                    timeWindow: 10000,
                    keyGenerator: (req: FastifyRequest) => {
                        const auth = req.headers.authorization;
                        if (auth && auth.startsWith("Bearer ")) {
                            try {
                                const base64Url = auth.split(".")[1];
                                if (!base64Url) return req.ip;
                                const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                                const payload = JSON.parse(Buffer.from(base64, "base64").toString()) as { sub?: string };
                                return payload.sub ?? req.ip;
                            } catch {
                                return req.ip;
                            }
                        }
                        return req.ip;
                    },
                },
            },
            preHandler: [authenticate, requireRole("EMPLOYEE")],
        },
        locationsController.recordLocation,
    );

    // Bulk ingest locations — EMPLOYEE only
    app.post(
        "/locations/batch",
        {
            schema: { tags: ["locations"] },
            config: {
                rateLimit: {
                    max: 10,
                    timeWindow: 10000,
                    keyGenerator: (req: FastifyRequest) => {
                        const auth = req.headers.authorization;
                        if (auth && auth.startsWith("Bearer ")) {
                            try {
                                const base64Url = auth.split(".")[1];
                                if (!base64Url) return req.ip;
                                const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                                const payload = JSON.parse(Buffer.from(base64, "base64").toString()) as { sub?: string };
                                return payload.sub ?? req.ip;
                            } catch {
                                return req.ip;
                            }
                        }
                        return req.ip;
                    },
                },
            },
            preHandler: [authenticate, requireRole("EMPLOYEE")],
        },
        locationsController.recordLocationBatch,
    );

    // Retrieve route — specific session history (EMPLOYEE)
    app.get(
        "/locations/my-route",
        {
            schema: { tags: ["locations"] },
            preHandler: [authenticate, requireRole("EMPLOYEE")],
        },
        locationsController.getRoute,
    );
}
