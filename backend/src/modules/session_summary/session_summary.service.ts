import type { FastifyRequest, FastifyInstance } from "fastify";
import { sessionSummaryRepository } from "./session_summary.repository.js";
import { locationsRepository } from "../locations/locations.repository.js";
import { attendanceRepository } from "../attendance/attendance.repository.js";
import { calculateHaversineDistance } from "../../utils/distance.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
import { metrics } from "../../utils/metrics.js";
import { env } from "../../config/env.js";
import { supabaseServiceClient as supabase } from "../../config/supabase.js";
import type { RecalculateResponse } from "./session_summary.schema.js";
import { performance } from "perf_hooks";

// ─── Constants ─────────────────────────────────────────────────────────────────

/**
 * Number of GPS point-pairs processed synchronously before yielding the event
 * loop via setImmediate. Keeps the Haversine inner loop from starving I/O on
 * dense sessions (e.g. 30k points = ~30 yields per chunk of 1000).
 */
const YIELD_EVERY_N_PAIRS = 100;

/** Number of location rows fetched per Supabase round-trip. */
const CHUNK_SIZE = 1000;

// ─── Shared Streaming Core ─────────────────────────────────────────────────────

/**
 * Minimal context the streaming engine needs.
 * Avoids coupling the internal worker path to a full FastifyRequest.
 *
 * Both the HTTP handler path and the background worker path satisfy this shape —
 * the HTTP path passes a real FastifyRequest (which has both fields), the worker
 * path passes a shaped object cast to FastifyRequest only where the repository
 * signatures require it.
 */
interface StreamingContext {
  organizationId: string;
}

/**
 * Streams all GPS points for a session in CHUNK_SIZE pages, accumulates the
 * Haversine distance, and yields the event loop every YIELD_EVERY_N_PAIRS
 * synchronous iterations so in-flight HTTP requests are never starved.
 *
 * Memory complexity: O(1) — only one chunk lives in memory at a time.
 * The last point of each chunk is carried forward to bridge chunk boundaries.
 *
 * @returns  { totalDistanceMeters, totalPoints }
 * @throws   BadRequestError when the session exceeds MAX_POINTS_PER_SESSION
 */
async function streamAndCalculateDistance(
  ctx: StreamingContext,
  sessionId: string,
): Promise<{ totalDistanceMeters: number; totalPoints: number }> {
  // Build a minimal request-shaped object that satisfies enforceTenant().
  // enforceTenant() only accesses request.organizationId — no other fields are used.
  // The cast is explicit and intentional; narrower than `as any`.
  const scopedRequest = ctx as unknown as FastifyRequest;

  let totalDistanceMeters = 0;
  let totalPoints = 0;
  let page = 1;
  let hasMore = true;
  let pairsProcessedInBatch = 0;

  // Tracks the last point of the previous chunk to bridge the inter-chunk gap
  // without breaking the route line mathematically.
  let lastPointFromPreviousChunk: {
    latitude: number;
    longitude: number;
    recorded_at: string;
  } | null = null;

  while (hasMore) {
    const pointsChunk =
      await locationsRepository.findPointsForDistancePaginated(
        scopedRequest,
        sessionId,
        page,
        CHUNK_SIZE,
      );

    if (pointsChunk.length === 0) {
      hasMore = false;
      break;
    }

    totalPoints += pointsChunk.length;

    // Guard: reject pathologically large sessions before they saturate the loop.
    // Admins can raise MAX_POINTS_PER_SESSION via env var if legitimate need exists.
    if (totalPoints > env.MAX_POINTS_PER_SESSION) {
      throw new BadRequestError(
        `Session exceeds the maximum allowed GPS points ` +
        `(${env.MAX_POINTS_PER_SESSION}). ` +
        `Recalculation rejected to protect the event loop. ` +
        `Raise MAX_POINTS_PER_SESSION to override.`,
      );
    }

    // Bridge the gap between this chunk and the previous one.
    if (lastPointFromPreviousChunk !== null) {
      totalDistanceMeters += calculateHaversineDistance(
        lastPointFromPreviousChunk.latitude,
        lastPointFromPreviousChunk.longitude,
        pointsChunk[0].latitude,
        pointsChunk[0].longitude,
      );
      pairsProcessedInBatch++;
    }

    // Inner loop — accumulate distance within this chunk.
    for (let i = 0; i < pointsChunk.length - 1; i++) {
      const p1 = pointsChunk[i];
      const p2 = pointsChunk[i + 1];

      totalDistanceMeters += calculateHaversineDistance(
        p1.latitude,
        p1.longitude,
        p2.latitude,
        p2.longitude,
      );

      pairsProcessedInBatch++;

      // Yield the event loop periodically to prevent starving I/O during
      // long synchronous CPU runs on high-density sessions.
      if (pairsProcessedInBatch >= YIELD_EVERY_N_PAIRS) {
        await new Promise<void>((resolve) => setImmediate(resolve));
        pairsProcessedInBatch = 0;
      }
    }

    // Carry the tail of this chunk forward for the next iteration.
    lastPointFromPreviousChunk = pointsChunk[pointsChunk.length - 1] ?? null;

    if (pointsChunk.length < CHUNK_SIZE) {
      // Received fewer rows than requested — we have reached the last page.
      hasMore = false;
    } else {
      page++;
    }
  }

  // Round to 2 decimal places to eliminate floating-point noise.
  totalDistanceMeters = Math.round(totalDistanceMeters * 100) / 100;

  return { totalDistanceMeters, totalPoints };
}

/**
 * Validates that a session's duration is within the configured ceiling.
 * An abnormally long session (e.g. a dev session left open for weeks) produces
 * meaningless duration_seconds and should not silently pollute analytics.
 *
 * @throws BadRequestError when duration exceeds MAX_SESSION_DURATION_HOURS
 */
function validateSessionDuration(
  checkInAt: string,
  checkOutAt: string | null,
  sessionId: string,
): number {
  const checkInMs = new Date(checkInAt).getTime();
  const endMs = checkOutAt ? new Date(checkOutAt).getTime() : Date.now();

  const durationSeconds = Math.max(0, Math.floor((endMs - checkInMs) / 1000));
  const durationHours = durationSeconds / 3600;

  if (durationHours > env.MAX_SESSION_DURATION_HOURS) {
    throw new BadRequestError(
      `Session ${sessionId} has an abnormal duration of ${durationHours.toFixed(1)} hours ` +
      `(maximum allowed: ${env.MAX_SESSION_DURATION_HOURS} hours). ` +
      `Recalculation rejected. Raise MAX_SESSION_DURATION_HOURS to override.`,
    );
  }

  return durationSeconds;
}

// ─── Service ───────────────────────────────────────────────────────────────────

/**
 * Session Summary service — core logic for the streaming distance engine.
 */
export const sessionSummaryService = {
  /**
   * HTTP-path recalculation: invoked by the /recalculate endpoint.
   *
   * Uses the authenticated FastifyRequest for full tenant enforcement and
   * structured request-scoped logging. Validates session ownership before
   * any computation begins.
   */
  async calculateAndSave(
    request: FastifyRequest,
    sessionId: string,
  ): Promise<RecalculateResponse> {
    const startTime = performance.now();

    // 1. Fetch the session — enforces tenant isolation via enforceTenant()
    const session = await attendanceRepository.getSessionById(
      request,
      sessionId,
    );
    if (!session) {
      throw new NotFoundError("Attendance session not found");
    }

    // 2. Guard: reject sessions with abnormal durations before streaming starts
    const durationSeconds = validateSessionDuration(
      session.checkin_at,
      session.checkout_at,
      session.id,
    );

    // 3. Stream GPS points, accumulate distance, yield event loop periodically
    const { totalDistanceMeters, totalPoints } =
      await streamAndCalculateDistance(
        { organizationId: request.organizationId },
        sessionId,
      );

    const executionTimeMs = Math.round(performance.now() - startTime);

    // 4. Persist summary (upsert — idempotent on session_id)
    await sessionSummaryRepository.upsertSummary(request, {
      organization_id: session.organization_id,
      session_id: session.id,
      total_distance_km: Math.round(totalDistanceMeters / 10) / 100, // convert m → km
      total_duration_seconds: durationSeconds,
      avg_speed_kmh:
        durationSeconds > 0
          ? Math.round((totalDistanceMeters / 1000 / (durationSeconds / 3600)) * 100) / 100
          : 0,
    });

    // 5. Update observability counters
    metrics.incrementRecalculations();
    metrics.recordRecalculationTime(executionTimeMs);

    request.log.info(
      {
        sessionId,
        employeeId: session.employee_id,
        organizationId: session.organization_id,
        totalDistanceMeters,
        durationSeconds,
        totalPoints,
        executionTimeMs,
      },
      "Calculated and saved session summary",
    );

    return {
      session_id: session.id,
      total_distance_km: Math.round(totalDistanceMeters / 10) / 100,
      total_duration_seconds: durationSeconds,
    };
  },

  /**
   * Worker-path recalculation: invoked by the background distance worker.
   *
   * Uses the Supabase service role client to fetch session data (bypassing
   * tenant RLS) then delegates all streaming computation to the shared
   * streamAndCalculateDistance() core. Uses FastifyInstance for structured
   * logging instead of a request-scoped logger.
   *
   * The organizationId extracted from the session is used to scope all
   * subsequent repository calls through enforceTenant(), preserving the
   * tenant isolation contract even in the background worker path.
   */
  async calculateAndSaveSystem(
    fastifyApp: FastifyInstance,
    sessionId: string,
  ): Promise<RecalculateResponse> {
    const startTime = performance.now();

    // 1. Fetch session data via service role (worker has no tenant context yet)
    const { data: sessionData, error: sessionErr } = await supabase
      .from("attendance_sessions")
      .select("id, employee_id, organization_id, checkin_at, checkout_at")
      .eq("id", sessionId)
      .single();

    if (sessionErr || !sessionData) {
      throw new NotFoundError(
        `Worker: attendance session not found — id=${sessionId}`,
      );
    }

    // 2. Guard: reject sessions with abnormal durations before streaming starts
    const durationSeconds = validateSessionDuration(
      sessionData.checkin_at as string,
      sessionData.checkout_at as string | null,
      sessionData.id as string,
    );

    // 3. Stream GPS points using the tenant-scoped organizationId from the session
    const { totalDistanceMeters, totalPoints } =
      await streamAndCalculateDistance(
        { organizationId: sessionData.organization_id as string },
        sessionId,
      );

    const executionTimeMs = Math.round(performance.now() - startTime);

    // 4. Persist summary.
    // upsertSummary's _request parameter is unused (prefixed _) — we satisfy the
    // signature with a minimal scoped object. Cast is explicit and narrower than `any`.
    const workerCtx = {
      organizationId: sessionData.organization_id as string,
    } as unknown as FastifyRequest;

    await sessionSummaryRepository.upsertSummary(workerCtx, {
      organization_id: sessionData.organization_id as string,
      session_id: sessionData.id as string,
      total_distance_km: Math.round(totalDistanceMeters / 10) / 100,
      total_duration_seconds: durationSeconds,
      avg_speed_kmh:
        durationSeconds > 0
          ? Math.round((totalDistanceMeters / 1000 / (durationSeconds / 3600)) * 100) / 100
          : 0,
    });

    // 5. Update observability counters
    metrics.incrementRecalculations();
    metrics.recordRecalculationTime(executionTimeMs);

    fastifyApp.log.info(
      {
        sessionId,
        employeeId: sessionData.employee_id,
        organizationId: sessionData.organization_id,
        totalDistanceMeters,
        durationSeconds,
        totalPoints,
        executionTimeMs,
        source: "background_worker",
      },
      "Asynchronously calculated and saved session summary",
    );

    return {
      session_id: sessionData.id as string,
      total_distance_km: Math.round(totalDistanceMeters / 10) / 100,
      total_duration_seconds: durationSeconds,
    };
  },
};
