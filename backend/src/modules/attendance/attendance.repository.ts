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
 *
 * Phase 15.5 — column names aligned with Phase 16 migration schema:
 *   user_id       → employee_id
 *   check_in_at   → checkin_at
 *   check_out_at  → checkout_at
 */
export const attendanceRepository = {
  /**
   * Find an open session (no checkout_at) for a specific employee.
   */
  async findOpenSession(
    request: FastifyRequest,
    employeeId: string,
  ): Promise<AttendanceSession | null> {
    const baseQuery = supabase
      .from("attendance_sessions")
      .select("id, employee_id, organization_id, checkin_at, checkout_at, distance_recalculation_status, total_distance_km, total_duration_seconds, created_at, updated_at")
      .eq("employee_id", employeeId)
      .is("checkout_at", null);

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
   * Exact lookup to validate that a specific session belongs to the employee and is still active.
   */
  async validateSessionActive(
    request: FastifyRequest,
    sessionId: string,
    employeeId: string,
  ): Promise<boolean> {
    const baseQuery = supabase
      .from("attendance_sessions")
      .select("id")
      .eq("id", sessionId)
      .eq("employee_id", employeeId)
      .is("checkout_at", null);

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
    employeeId: string,
  ): Promise<AttendanceSession> {
    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from("attendance_sessions")
      .insert({
        employee_id: employeeId,
        organization_id: request.organizationId,
        checkin_at: now,
      })
      .select("id, employee_id, organization_id, checkin_at, checkout_at, distance_recalculation_status, total_distance_km, total_duration_seconds, created_at, updated_at")
      .single();

    if (error) {
      throw new Error(`Failed to create session: ${error.message}`);
    }
    return data as AttendanceSession;
  },

  /**
   * Close an open session by setting checkout_at.
   */
  async closeSession(
    request: FastifyRequest,
    sessionId: string,
  ): Promise<AttendanceSession> {
    const now = new Date().toISOString();

    const baseQuery = supabase
      .from("attendance_sessions")
      .update({ checkout_at: now })
      .eq("id", sessionId);

    const { data, error } = await enforceTenant(request, baseQuery)
      .select("id, employee_id, organization_id, checkin_at, checkout_at, distance_recalculation_status, total_distance_km, total_duration_seconds, created_at, updated_at")
      .single();

    if (error) {
      throw new Error(`Failed to close session: ${error.message}`);
    }
    return data as AttendanceSession;
  },

  /**
   * Get all sessions for a specific employee (employee's own sessions).
   */
  async findSessionsByUser(
    request: FastifyRequest,
    employeeId: string,
    page: number,
    limit: number,
  ): Promise<AttendanceSession[]> {
    const offset = (page - 1) * limit;

    const baseQuery = supabase
      .from("attendance_sessions")
      .select("id, employee_id, organization_id, checkin_at, checkout_at, distance_recalculation_status, total_distance_km, total_duration_seconds, created_at, updated_at")
      .eq("employee_id", employeeId)
      .order("checkin_at", { ascending: false });

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
      .select("id, employee_id, organization_id, checkin_at, checkout_at, distance_recalculation_status, total_distance_km, total_duration_seconds, created_at, updated_at")
      .order("checkin_at", { ascending: false });

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
      .select("id, employee_id, organization_id, checkin_at, checkout_at, distance_recalculation_status, total_distance_km, total_duration_seconds, created_at, updated_at")
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
   * Selects the minimal columns required to identify orphaned sessions.
   * Runs against the service role key — intentionally bypasses RLS to
   * sweep all tenant partitions in a single bootstrap scan.
   *
   * Phase 15.5 — column names updated:
   *   check_out_at → checkout_at
   */
  async findSessionsNeedingRecalculation(
    log: FastifyBaseLogger,
  ): Promise<{ id: string }[]> {
    // Hard cap on sessions scanned per recovery run.
    const RECOVERY_SCAN_LIMIT = 500;

    const { data, error } = await supabaseServiceClient
      .from("attendance_sessions")
      .select(
        `
                id,
                checkout_at,
                session_summaries (
                    computed_at
                )
            `,
      )
      .not("checkout_at", "is", null)
      .order("checkout_at", { ascending: true })
      .limit(RECOVERY_SCAN_LIMIT);

    if (error) {
      log.error({ error: error.message }, "Recovery scan query failed");
      return [];
    }

    if (!data) return [];

    const requiresRecalculation: { id: string }[] = [];

    for (const row of data) {
      const summaries = Array.isArray(row.session_summaries)
        ? row.session_summaries
        : row.session_summaries
          ? [row.session_summaries]
          : [];

      const summary = summaries[0] as { computed_at: string } | undefined;
      const checkoutAt = row.checkout_at as string;

      if (!summary) {
        requiresRecalculation.push({ id: row.id });
      } else if (
        new Date(summary.computed_at).getTime() < new Date(checkoutAt).getTime()
      ) {
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
