import type { FastifyRequest } from "fastify";
import { attendanceRepository } from "./attendance.repository.js";
import { enqueueDistanceJob } from "../../workers/distance.queue.js";
import {
  NotFoundError,
  EmployeeAlreadyCheckedIn,
  SessionAlreadyClosed,
} from "../../utils/errors.js";
import type { AttendanceSession } from "./attendance.schema.js";

/**
 * Attendance service — business logic for check-in/check-out.
 * Enforces rules: no duplicate check-ins, no check-out without open session.
 */
export const attendanceService = {
  /**
   * Check in — creates a new session if no open session exists.
   */
  async checkIn(request: FastifyRequest): Promise<AttendanceSession> {
    const userId = request.user.sub;

    // 1. Resolve users.id → employees.id (they are different PKs).
    //    findEmployeeIdByUserId also validates is_active and org membership.
    const employeeId = await attendanceRepository.findEmployeeIdByUserId(
      request,
      userId,
    );
    if (!employeeId) {
      throw new NotFoundError("Employee not found in this organization.");
    }

    // 2. Prevent duplicate active sessions.
    const openSession = await attendanceRepository.findOpenSession(
      request,
      employeeId,
    );
    if (openSession) {
      throw new EmployeeAlreadyCheckedIn();
    }

    request.log.info(
      { userId, employeeId, organizationId: request.organizationId },
      "Employee checked in",
    );
    return attendanceRepository.createSession(request, employeeId);
  },

  /**
   * Check out — closes the open session if one exists.
   * Enqueues the closed session into a background worker for distance calculation.
   */
  async checkOut(request: FastifyRequest): Promise<AttendanceSession> {
    const userId = request.user.sub;

    // Resolve users.id → employees.id before querying employee_id column.
    const employeeId = await attendanceRepository.findEmployeeIdByUserId(
      request,
      userId,
    );
    if (!employeeId) {
      throw new NotFoundError("Employee not found in this organization.");
    }

    const openSession = await attendanceRepository.findOpenSession(
      request,
      employeeId,
    );
    if (!openSession) {
      throw new SessionAlreadyClosed();
    }

    request.log.info(
      { userId, employeeId, organizationId: request.organizationId },
      "Employee checked out",
    );
    const closedSession = await attendanceRepository.closeSession(
      request,
      openSession.id,
    );

    // Phase 10: Enqueue distance computation into durable BullMQ queue.
    // Fire-and-forget so check-out is instantaneous.
    // Job deduplication guaranteed by jobId = sessionId in BullMQ.
    enqueueDistanceJob(closedSession.id).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      request.log.warn(
        { sessionId: closedSession.id, error: message },
        "Failed to enqueue distance job — session summary may be delayed",
      );
    });

    return closedSession;
  },

  /**
   * Get the current user's own sessions.
   */
  async getMySessions(
    request: FastifyRequest,
    page: number,
    limit: number,
  ): Promise<AttendanceSession[]> {
    const userId = request.user.sub;

    // Resolve users.id → employees.id before filtering by employee_id.
    const employeeId = await attendanceRepository.findEmployeeIdByUserId(
      request,
      userId,
    );
    if (!employeeId) return [];

    return attendanceRepository.findSessionsByUser(
      request,
      employeeId,
      page,
      limit,
    );
  },

  /**
   * Get all sessions in the organization (ADMIN only).
   * Role enforcement happens at the route level via requireRole middleware.
   */
  async getOrgSessions(
    request: FastifyRequest,
    page: number,
    limit: number,
  ): Promise<AttendanceSession[]> {
    return attendanceRepository.findSessionsByOrg(request, page, limit);
  },
};
