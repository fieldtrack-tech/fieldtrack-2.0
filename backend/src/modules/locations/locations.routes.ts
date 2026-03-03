import type { FastifyInstance } from "fastify";
import { authenticate } from "../../middleware/auth.js";
import { requireRole } from "../../middleware/role-guard.js";
import { locationsController } from "./locations.controller.js";

/**
 * Location routes — endpoints for ingesting and retrieving GPS tracks.
 */
export async function locationsRoutes(app: FastifyInstance): Promise<void> {
    const rateLimitConfig = {
        config: {
            rateLimit: {
                max: 10,
                timeWindow: 10000, // 10 requests per 10 seconds
                keyGenerator: (req: any) => {
                    // req.user might not be populated in onRequest, so decode JWT payload manually 
                    const auth = req.headers.authorization;
                    if (auth && auth.startsWith("Bearer ")) {
                        try {
                            const base64Url = auth.split(".")[1];
                            const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
                            const payload = JSON.parse(Buffer.from(base64, "base64").toString());
                            return payload.sub || req.ip;
                        } catch {
                            return req.ip;
                        }
                    }
                    return req.ip;
                },
            },
        },
        preHandler: [authenticate, requireRole("EMPLOYEE")],
    };

    // Ingest location — EMPLOYEE only
    app.post("/locations", rateLimitConfig, locationsController.recordLocation);

    // Bulk ingest locations — EMPLOYEE only
    app.post("/locations/batch", rateLimitConfig, locationsController.recordLocationBatch);

    // Retrieve route — specific session history (EMPLOYEE)
    app.get("/locations/my-route", {
        preHandler: [authenticate, requireRole("EMPLOYEE")],
    }, locationsController.getRoute);
}
