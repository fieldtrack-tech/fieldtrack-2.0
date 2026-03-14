import type { FastifyRequest } from "fastify";
import { attendanceRepository } from "./attendance.repository.js";
import { enqueueDistanceJob } from "../../workers/distance.queue.js";
import {
  EmployeeAlreadyCheckedIn,
  SessionAlreadyClosed,
  requireEmployeeContext,
} from "../../utils/errors.js";
import type { AttendanceSession } from "./attendance.schema.js";
import type { EnrichedAttendanceSession } from "./attendance.repository.js";
import { profileRepository } from "../profile/profile.repository.js";

/**
 * Attendance service — business logic for check-in/check-out.
 * Enforces rules: no duplicate check-ins, no check-out without open session.
 *
 * Phase: employeeId resolved once in auth middleware (request.employeeId).
 * requireEmployeeContext() asserts presence and narrows the type.
 */
export const attendanceService = {
  async checkIn(request: FastifyRequest): Promise<AttendanceSession> {
    requireEmployeeContext(request);
    const { employeeId } = request;

    const openSession = await attendanceRepository.findOpenSession(request, employeeId);
    if (openSession) throw new EmployeeAlreadyCheckedIn();

    request.log.info(
      { userId: request.user.sub, employeeId, organizationId: request.organizationId },
      "Employee checked in",
    );

    // Update last_activity_at (fire-and-forget)
    profileRepository.updateLastActivity(request, employeeId).catch(() => {});

    const session = await attendanceRepository.createSession(request, employeeId);

    // Keep snapshot table in sync — fire-and-forget so check-in latency is unaffected
    attendanceRepository
      .upsertLatestSession(request.organizationId, employeeId, session)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        request.log.warn({ sessionId: session.id, error: msg }, "Failed to upsert latest session snapshot after check-in");
      });

    return session;
  },

  async checkOut(request: FastifyRequest): Promise<AttendanceSession> {
    requireEmployeeContext(request);
    const { employeeId } = request;

    const openSession = await attendanceRepository.findOpenSession(request, employeeId);
    if (!openSession) throw new SessionAlreadyClosed();

    request.log.info(
      { userId: request.user.sub, employeeId, organizationId: request.organizationId },
      "Employee checked out",
    );
    const closedSession = await attendanceRepository.closeSession(request, openSession.id);

    // Keep snapshot table in sync — fire-and-forget so check-out latency is unaffected
    attendanceRepository
      .upsertLatestSession(request.organizationId, employeeId, closedSession)
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        request.log.warn({ sessionId: closedSession.id, error: msg }, "Failed to upsert latest session snapshot after check-out");
      });

    enqueueDistanceJob(closedSession.id).catch((err: unknown) => {
      const message = err instanceof Error ? err.message : String(err);
      request.log.warn(
        { sessionId: closedSession.id, error: message },
        "Failed to enqueue distance job — session summary may be delayed",
      );
    });

    return closedSession;
  },

  async getMySessions(
    request: FastifyRequest,
    page: number,
    limit: number,
  ): Promise<{ data: EnrichedAttendanceSession[]; total: number }> {
    const employeeId = request.employeeId;
    if (!employeeId) return { data: [], total: 0 };
    return attendanceRepository.findSessionsByUser(request, employeeId, page, limit);
  },

  async getOrgSessions(
    request: FastifyRequest,
    page: number,
    limit: number,
    status: string = "all",
    employeeId?: string,
  ): Promise<{ data: EnrichedAttendanceSession[]; total: number }> {
    if (employeeId) {
      return attendanceRepository.findSessionsByUser(request, employeeId, page, limit);
    }
    return attendanceRepository.findLatestSessionPerEmployee(request, page, limit, status);
  },
};
