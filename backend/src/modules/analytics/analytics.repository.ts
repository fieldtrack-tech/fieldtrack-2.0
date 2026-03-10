import { supabaseAnonClient as supabase } from "../../config/supabase.js";
import { enforceTenant } from "../../utils/tenant.js";
import type { FastifyRequest } from "fastify";
import type {
  MinimalSessionRow,
  MinimalSummaryRow,
  MinimalExpenseRow,
} from "./analytics.schema.js";

/**
 * Analytics repository — read-only queries for the analytics layer.
 *
 * Design principles:
 *  - Never select("*") — only fetch columns required for aggregation.
 *  - All queries are scoped via enforceTenant() — cross-tenant reads are impossible.
 *  - Two-query pattern for session range filtering.
 *  - Early-return empty arrays when the first query returns no rows.
 *
 * Phase 15.5 — aligned with Phase 16 migration schema:
 *   attendance_sessions: user_id → employee_id, check_in_at → checkin_at
 *   session_summaries: total_distance_meters → total_distance_km, duration_seconds → total_duration_seconds
 *   expenses: created_at filter → submitted_at
 *
 * Index dependencies:
 *   attendance_sessions(organization_id, checkin_at)           — range scan
 *   session_summaries(session_id, organization_id)             — IN lookup
 *   expenses(organization_id, submitted_at)                    — range scan
 */
export const analyticsRepository = {
  // ─── Session Helpers ──────────────────────────────────────────────────────

  /**
   * Resolve sessions within an optional date range for the requesting org.
   * Returns minimal {id, employee_id} rows — no GPS data, no full row fetches.
   *
   * Relies on index: attendance_sessions(organization_id, checkin_at)
   */
  async getSessionsInRange(
    request: FastifyRequest,
    from: string | undefined,
    to: string | undefined,
  ): Promise<MinimalSessionRow[]> {
    let baseQuery = supabase
      .from("attendance_sessions")
      .select("id, employee_id, total_distance_km, total_duration_seconds")
      .order("checkin_at", { ascending: false });

    if (from !== undefined) {
      baseQuery = baseQuery.gte("checkin_at", from) as typeof baseQuery;
    }
    if (to !== undefined) {
      baseQuery = baseQuery.lte("checkin_at", to) as typeof baseQuery;
    }

    const { data, error } = await enforceTenant(request, baseQuery);

    if (error) {
      throw new Error(`Analytics: failed to fetch sessions in range: ${error.message}`);
    }
    return (data ?? []) as MinimalSessionRow[];
  },

  /**
   * Resolve sessions within an optional date range filtered to a specific employee.
   */
  async getSessionsForUser(
    request: FastifyRequest,
    employeeId: string,
    from: string | undefined,
    to: string | undefined,
  ): Promise<MinimalSessionRow[]> {
    let baseQuery = supabase
      .from("attendance_sessions")
      .select("id, employee_id, total_distance_km, total_duration_seconds")
      .eq("employee_id", employeeId)
      .order("checkin_at", { ascending: false });

    if (from !== undefined) {
      baseQuery = baseQuery.gte("checkin_at", from) as typeof baseQuery;
    }
    if (to !== undefined) {
      baseQuery = baseQuery.lte("checkin_at", to) as typeof baseQuery;
    }

    const { data, error } = await enforceTenant(request, baseQuery);

    if (error) {
      throw new Error(`Analytics: failed to fetch user sessions: ${error.message}`);
    }
    return (data ?? []) as MinimalSessionRow[];
  },

  /**
   * Lightweight check — returns true if the employee has at least one attendance
   * session in the requesting org.
   */
  async checkUserHasSessionsInOrg(
    request: FastifyRequest,
    employeeId: string,
  ): Promise<boolean> {
    const baseQuery = supabase
      .from("attendance_sessions")
      .select("id")
      .eq("employee_id", employeeId)
      .limit(1);

    const { data, error } = await enforceTenant(request, baseQuery);

    if (error) {
      throw new Error(`Analytics: user validation query failed: ${error.message}`);
    }
    return (data ?? []).length > 0;
  },

  // ─── Summary Helpers ──────────────────────────────────────────────────────

  /**
   * Fetch pre-computed session summary rows for a given list of session IDs.
   *
   * Phase 15.5: column names corrected to Phase 16 schema:
   *   total_distance_meters → total_distance_km
   *   duration_seconds      → total_duration_seconds
   *
   * Note: session_summaries does NOT have an organization_id column in the
   * Phase 16 schema. enforceTenant() is therefore NOT applied here — tenant
   * isolation is guaranteed by the caller resolving session IDs through an
   * org-scoped attendance_sessions query first.
   *
   * Relies on index: session_summaries(session_id)
   */
  async getSummariesForSessions(
    request: FastifyRequest,
    sessionIds: string[],
  ): Promise<MinimalSummaryRow[]> {
    if (sessionIds.length === 0) return [];

    // session_summaries has organization_id in Phase 16 schema — enforceTenant
    // provides defense-in-depth even though session IDs are already org-scoped.
    const baseQuery = supabase
      .from("session_summaries")
      .select("session_id, organization_id, total_distance_km, total_duration_seconds")
      .in("session_id", sessionIds);

    const { data, error } = await enforceTenant(request, baseQuery);

    if (error) {
      throw new Error(`Analytics: failed to fetch session summaries: ${error.message}`);
    }
    return (data ?? []) as MinimalSummaryRow[];
  },

  // ─── Expense Helpers ──────────────────────────────────────────────────────

  /**
   * Fetch minimal expense rows (amount + status only) for the org within the
   * optional date range.
   *
   * Phase 15.5: filter column corrected: created_at → submitted_at
   *
   * Relies on index: expenses(organization_id, submitted_at)
   */
  async getExpensesInRange(
    request: FastifyRequest,
    from: string | undefined,
    to: string | undefined,
  ): Promise<MinimalExpenseRow[]> {
    let baseQuery = supabase
      .from("expenses")
      .select("amount, status");

    if (from !== undefined) {
      baseQuery = baseQuery.gte("submitted_at", from) as typeof baseQuery;
    }
    if (to !== undefined) {
      baseQuery = baseQuery.lte("submitted_at", to) as typeof baseQuery;
    }

    const { data, error } = await enforceTenant(request, baseQuery);

    if (error) {
      throw new Error(`Analytics: failed to fetch expenses: ${error.message}`);
    }
    return (data ?? []) as MinimalExpenseRow[];
  },

  /**
   * Count all active employees in the requesting org.
   *
   * Uses a HEAD request (no row data returned) so Postgres only executes
   * a COUNT — far cheaper than fetching rows and measuring .length.
   *
   * Relies on index: employees(organization_id)
   */
  async getActiveEmployeesCount(request: FastifyRequest): Promise<number> {
    const baseQuery = supabase
      .from("employees")
      .select("id", { count: "exact", head: true })
      .eq("is_active", true);

    const result = await enforceTenant(request, baseQuery);

    if (result.error) {
      throw new Error(
        `Analytics: failed to count active employees: ${result.error.message}`,
      );
    }
    return result.count ?? 0;
  },

  /**
   * Same as getExpensesInRange but scoped to a specific employee_id.
   */
  async getExpensesForUser(
    request: FastifyRequest,
    employeeId: string,
    from: string | undefined,
    to: string | undefined,
  ): Promise<MinimalExpenseRow[]> {
    let baseQuery = supabase
      .from("expenses")
      .select("amount, status")
      .eq("employee_id", employeeId);

    if (from !== undefined) {
      baseQuery = baseQuery.gte("submitted_at", from) as typeof baseQuery;
    }
    if (to !== undefined) {
      baseQuery = baseQuery.lte("submitted_at", to) as typeof baseQuery;
    }

    const { data, error } = await enforceTenant(request, baseQuery);

    if (error) {
      throw new Error(`Analytics: failed to fetch user expenses: ${error.message}`);
    }
    return (data ?? []) as MinimalExpenseRow[];
  },
};
