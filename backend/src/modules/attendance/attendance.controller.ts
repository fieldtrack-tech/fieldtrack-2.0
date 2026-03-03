import type { FastifyRequest, FastifyReply } from "fastify";
import { attendanceService } from "./attendance.service.js";
import { paginationSchema } from "./attendance.schema.js";
import { AppError } from "../../utils/errors.js";

/**
 * Attendance controller — extracts request data, calls service, returns response.
 */
export const attendanceController = {
    async checkIn(request: FastifyRequest, reply: FastifyReply): Promise<void> {
        try {
            const session = await attendanceService.checkIn(request);
            reply.status(201).send({ success: true, data: session });
        } catch (error) {
            if (error instanceof AppError) {
                reply.status(error.statusCode).send({ error: error.message });
                return;
            }
            request.log.error(error, "Unexpected error during check-in");
            reply.status(500).send({ error: "Internal server error" });
        }
    },

    async checkOut(request: FastifyRequest, reply: FastifyReply): Promise<void> {
        try {
            const session = await attendanceService.checkOut(request);
            reply.status(200).send({ success: true, data: session });
        } catch (error) {
            if (error instanceof AppError) {
                reply.status(error.statusCode).send({ error: error.message });
                return;
            }
            request.log.error(error, "Unexpected error during check-out");
            reply.status(500).send({ error: "Internal server error" });
        }
    },

    async getMySessions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
        try {
            const parsed = paginationSchema.parse(request.query);
            const sessions = await attendanceService.getMySessions(request, parsed.page, parsed.limit);
            reply.status(200).send({ success: true, data: sessions });
        } catch (error) {
            if (error instanceof AppError) {
                reply.status(error.statusCode).send({ error: error.message });
                return;
            }
            request.log.error(error, "Unexpected error fetching user sessions");
            reply.status(500).send({ error: "Internal server error" });
        }
    },

    async getOrgSessions(request: FastifyRequest, reply: FastifyReply): Promise<void> {
        try {
            const parsed = paginationSchema.parse(request.query);
            const sessions = await attendanceService.getOrgSessions(request, parsed.page, parsed.limit);
            reply.status(200).send({ success: true, data: sessions });
        } catch (error) {
            if (error instanceof AppError) {
                reply.status(error.statusCode).send({ error: error.message });
                return;
            }
            request.log.error(error, "Unexpected error fetching org sessions");
            reply.status(500).send({ error: "Internal server error" });
        }
    },
};
