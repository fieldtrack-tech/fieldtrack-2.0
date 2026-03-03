import type { FastifyInstance } from "fastify";
import { healthRoutes } from "./health.js";
import { attendanceRoutes } from "../modules/attendance/attendance.routes.js";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
    await app.register(healthRoutes);
    await app.register(attendanceRoutes);
}
