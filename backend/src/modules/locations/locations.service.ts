import type { FastifyRequest } from "fastify";
import { locationsRepository } from "./locations.repository.js";
import { attendanceRepository } from "../attendance/attendance.repository.js";
import { BadRequestError } from "../../utils/errors.js";
import { metrics } from "../../utils/metrics.js";
import type {
  LocationRecord,
  CreateLocationBody,
  CreateLocationBatchBody,
} from "./locations.schema.js";

import { performance } from "perf_hooks";

/**
 * Location service — business logic for ingesting and retrieving locations.
 * Must verify attendance sessions before operating.
 */
export const locationsService = {
  /**
   * Ingest a new location point.
   * Rules: Explicit session_id from client; backend validates ownership and active status.
   */
  async recordLocation(
    request: FastifyRequest,
    body: CreateLocationBody,
  ): Promise<LocationRecord> {
    const start = performance.now();
    const userId = request.user.sub;

    // Resolve users.id → employees.id before querying employee_id column.
    const employeeId = await attendanceRepository.findEmployeeIdByUserId(
      request,
      userId,
    );
    if (!employeeId) throw new BadRequestError("Employee profile not found.");

    const isValid = await attendanceRepository.validateSessionActive(
      request,
      body.session_id,
      employeeId,
    );

    if (!isValid) {
      throw new BadRequestError(
        "Cannot record location: invalid or closed attendance session.",
      );
    }

    const record = await locationsRepository.createLocation(
      request,
      employeeId,
      body.session_id,
      body,
    );
    const latencyMs = Math.round(performance.now() - start);

    // Count every successfully persisted point (duplicates are suppressed at DB layer,
    // so a successful return here always represents one new row written).
    metrics.incrementLocationsInserted(1);

    request.log.info(
      {
        userId,
        employeeId,
        organizationId: request.organizationId,
        sessionId: body.session_id,
        latencyMs,
      },
      "Ingested new location point",
    );

    return record;
  },

  /**
   * Ingest a batch of location points.
   * Rules: Explicit session_id from client; backend validates ownership and active status.
   */
  async recordLocationBatch(
    request: FastifyRequest,
    body: CreateLocationBatchBody,
  ): Promise<number> {
    const start = performance.now();
    const userId = request.user.sub;

    // Resolve users.id → employees.id before querying employee_id column.
    const employeeId = await attendanceRepository.findEmployeeIdByUserId(
      request,
      userId,
    );
    if (!employeeId) throw new BadRequestError("Employee profile not found.");

    const isValid = await attendanceRepository.validateSessionActive(
      request,
      body.session_id,
      employeeId,
    );

    if (!isValid) {
      throw new BadRequestError(
        "Cannot record locations: invalid or closed attendance session.",
      );
    }

    const insertedCount = await locationsRepository.createLocationBatch(
      request,
      employeeId,
      body.session_id,
      body.points,
    );

    const latencyMs = Math.round(performance.now() - start);
    const duplicatesSuppressed = body.points.length - insertedCount;

    // Only count the rows that were actually written, not the duplicates suppressed
    // by the DB-layer upsert. This keeps the metric accurate under mobile retries.
    metrics.incrementLocationsInserted(insertedCount);

    request.log.info(
      {
        userId,
        employeeId,
        organizationId: request.organizationId,
        sessionId: body.session_id,
        insertedCount,
        duplicatesSuppressed,
        latencyMs,
      },
      "Ingested batch of location points",
    );

    return insertedCount;
  },

  /**
   * Retrieve the ordered location route for a specific session.
   * Rules: Employee can only retrieve their own sessions.
   */
  async getRoute(
    request: FastifyRequest,
    sessionId: string,
  ): Promise<LocationRecord[]> {
    const userId = request.user.sub;

    // Resolve users.id → employees.id before filtering location history by employee_id.
    const employeeId = await attendanceRepository.findEmployeeIdByUserId(
      request,
      userId,
    );

    return locationsRepository.findLocationsBySession(request, sessionId, employeeId ?? undefined);
  },
};
