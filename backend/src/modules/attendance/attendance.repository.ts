import {
  supabaseAnonClient as supabase,
  supabaseServiceClient,
} from "../../config/supabase.js";
import { enforceTenant } from "../../utils/tenant.js";
import type { FastifyRequest, FastifyBaseLogger } from "fastify";
import type { AttendanceSession } from "./attendance.schema.js";

/**
 * Attendance repository — all Supabase queries for attendance_sessions.
 * Every query is scoped via enforceTenant() for tenant isolation.
 * enforceTenant() is always called BEFORE terminal operations (.single/.range).
 */
export const attendanceRepository = {
  /**
   * Find an open session (no check_out_at) for a specific user.
   */
  async findOpenSession(
    request: FastifyRequest,
    userId: string,
  ): Promise<AttendanceSession | null> {
    const baseQuery = supabase
      .from("attendance_sessions")
      .select("*")
      .eq("user_id", userId)
      .is("check_out_at", null);

    const { data, error } = await enforceTenant(request, baseQuery)
      .limit(1)
      .single();

    // PGRST116 = no rows found — not an error for our use case
    if (error && error.code === "PGRST116") {
      return null;
    }
    if (error) {
      throw new Error(`Failed to find open session: ${error.message}`);
    }
    return data as AttendanceSession;
  },

  /**
   * Exact lookup to validate that a specific session belongs to the user and is still active.
   */
  async validateSessionActive(
    request: FastifyRequest,
    sessionId: string,
    userId: string,
  ): Promise<boolean> {
    const baseQuery = supabase
      .from("attendance_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("user_id", userId)
      .is("check_out_at", null);

    const { data, error } = await enforceTenant(request, baseQuery)
      .limit(1)
      .single();

    if (error && error.code === "PGRST116") {
      return false;
    }
    if (error) {
      throw new Error(`Failed to validate session: ${error.message}`);
    }
    return !!data;
  },

  /**
   * Create a new check-in session.
   * Insert doesn't need enforceTenant() — we explicitly set organization_id.
   */
  async createSession(
    request: FastifyRequest,
    userId: string,
  ): Promise<AttendanceSession> {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("attendance_sessions")
      .insert({
        user_id: userId,
        organization_id: request.organizationId,
        check_in_at: now,
        created_at: now,
        updated_at: now,
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }
    return data as AttendanceSession;
  },

  /**
   * Close an open session by setting check_out_at.
   */
  async closeSession(
    request: FastifyRequest,
    sessionId: string,
  ): Promise<AttendanceSession> {
    const now = new Date().toISOString();

    const baseQuery = supabase
      .from("attendance_sessions")
      .update({ check_out_at: now, updated_at: now })
      .eq("id", sessionId);

    const { data, error } = await enforceTenant(request, baseQuery)
      .select("*")
      .single();

    if (error) {
      throw new Error(`Failed to close session: ${error.message}`);
    }
    return data as AttendanceSession;
  },

  /**
   * Get all sessions for a specific user (employee's own sessions).
   */
  async findSessionsByUser(
    request: FastifyRequest,
    userId: string,
    page: number,
    limit: number,
  ): Promise<AttendanceSession[]> {
    const offset = (page - 1) * limit;

    const baseQuery = supabase
      .from("attendance_sessions")
      .select("*")
      .eq("user_id", userId)
      .order("check_in_at", { ascending: false });

    const { data, error } = await enforceTenant(request, baseQuery).range(
      offset,
      offset + limit - 1,
    );

    if (error) {
      throw new Error(`Failed to fetch user sessions: ${error.message}`);
    }
    return (data ?? []) as AttendanceSession[];
  },

  /**
   * Get all sessions for the entire organization (admin view).
   */
  async findSessionsByOrg(
    request: FastifyRequest,
    page: number,
    limit: number,
  ): Promise<AttendanceSession[]> {
    const offset = (page - 1) * limit;

    const baseQuery = supabase
      .from("attendance_sessions")
      .select("*")
      .order("check_in_at", { ascending: false });

    const { data, error } = await enforceTenant(request, baseQuery).range(
      offset,
      offset + limit - 1,
    );

    if (error) {
      throw new Error(`Failed to fetch org sessions: ${error.message}`);
    }
    return (data ?? []) as AttendanceSession[];
  },

  /**
   * Fetch a session exactly by ID for recalculation tasks.
   * Still respects tenant isolation implicitly via enforceTenant.
   */
  async getSessionById(
    request: FastifyRequest,
    sessionId: string,
  ): Promise<AttendanceSession | null> {
    const baseQuery = supabase
      .from("attendance_sessions")
      .select("*")
      .eq("id", sessionId);

    const { data, error } = await enforceTenant(request, baseQuery).single();

    if (error && error.code === "PGRST116") {
      return null;
    }
    if (error) {
      throw new Error(`Failed to fetch session: ${error.message}`);
    }
    return data as AttendanceSession;
  },

  /**
   * Phase 7.5 — Crash Recovery & Self-Healing.
   *
   * Selects the minimal columns required to identify orphaned sessions:
   *   - id              → enqueue key (only field consumed by the caller)
   *   - check_out_at    → used to detect summaries that predate the final checkout
   *   - session_summaries(updated_at) → left-join to detect missing/stale rows
   *
   * Applies a hard row limit and stable ascending ordering so the result is
   * deterministic and bounded regardless of platform size.
   *
   * Runs against the service role key — intentionally bypasses RLS to
   * sweep all tenant partitions in a single bootstrap scan.
   */
  async findSessionsNeedingRecalculation(
    log: FastifyBaseLogger,
  ): Promise<{ id: string }[]> {
    // Hard cap on sessions scanned per recovery run.
    // Prevents a large backlog from flooding the in-memory queue on every restart.
    // Oldest unprocessed sessions are prioritised via ascending order.
    const RECOVERY_SCAN_LIMIT = 500;

    const { data, error } = await supabaseServiceClient
      .from("attendance_sessions")
      .select(
        `
                id,
                check_out_at,
                session_summaries (
                    updated_at
                )
            `,
      )
      .not("check_out_at", "is", null)
      .order("check_out_at", { ascending: true })
      .limit(RECOVERY_SCAN_LIMIT);

    if (error) {
      log.error({ error: error.message }, "Recovery scan query failed");
      return [];
    }

    if (!data) return [];

    const requiresRecalculation: { id: string }[] = [];

    for (const row of data) {
      // Supabase returns a 1:1 left-join as either an object or an array depending
      // on schema setup — normalise defensively to avoid runtime surprises.
      const summaries = Array.isArray(row.session_summaries)
        ? row.session_summaries
        : row.session_summaries
          ? [row.session_summaries]
          : [];

      const summary = summaries[0] as { updated_at: string } | undefined;
      const checkOutAt = row.check_out_at as string;

      if (!summary) {
        // No summary row at all — calculation was never persisted
        requiresRecalculation.push({ id: row.id });
      } else if (
        new Date(summary.updated_at).getTime() < new Date(checkOutAt).getTime()
      ) {
        // Summary exists but was generated before the final check_out_at timestamp —
        // the checkout recalculation was enqueued but never persisted (process crash).
        requiresRecalculation.push({ id: row.id });
      }
    }

    log.info(
      {
        scanned: data.length,
        needsRecalculation: requiresRecalculation.length,
      },
      "Recovery scan complete",
    );

    return requiresRecalculation;
  },
};
