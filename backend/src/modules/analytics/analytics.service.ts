import type { FastifyRequest } from "fastify";
import { analyticsRepository } from "./analytics.repository.js";
import { attendanceRepository } from "../attendance/attendance.repository.js";
import { BadRequestError } from "../../utils/errors.js";
import type {
  OrgSummaryData,
  UserSummaryData,
  TopPerformerEntry,
  AnalyticsMetric,
  MinimalExpenseRow,
} from "./analytics.schema.js";

// ─── Internal Aggregation Helpers ─────────────────────────────────────────────

/**
 * Validate that from <= to when both are present.
 * Throws BadRequestError on violation so the controller can return 400.
 */
function validateDateRange(
  from: string | undefined,
  to: string | undefined,
): void {
  if (from !== undefined && to !== undefined) {
    if (new Date(from).getTime() > new Date(to).getTime()) {
      throw new BadRequestError(
        "'from' date must not be later than 'to' date",
      );
    }
  }
}

/**
 * Aggregate expense rows into counts and amounts by status.
 * Pure function — no DB access.
 */
function aggregateExpenses(expenses: MinimalExpenseRow[]): {
  totalExpenses: number;
  approvedExpenseAmount: number;
  rejectedExpenseAmount: number;
} {
  let totalExpenses = 0;
  let approvedExpenseAmount = 0;
  let rejectedExpenseAmount = 0;

  for (const row of expenses) {
    totalExpenses++;
    if (row.status === "APPROVED") approvedExpenseAmount += row.amount;
    if (row.status === "REJECTED") rejectedExpenseAmount += row.amount;
  }

  return {
    totalExpenses,
    approvedExpenseAmount: Math.round(approvedExpenseAmount * 100) / 100,
    rejectedExpenseAmount: Math.round(rejectedExpenseAmount * 100) / 100,
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

/**
 * Analytics service — aggregation logic for all three endpoints.
 *
 * All metric aggregation reads directly from attendance_sessions using
 * the pre-computed total_distance_km / total_duration_seconds columns
 * (populated by the distance worker after each checkout). This avoids
 * an empty session_summaries table returning zero aggregates.
 */
export const analyticsService = {
  /**
   * Org-wide summary for a given date range.
   *
   * Strategy:
   *  1. Resolve session IDs + user IDs from attendance_sessions (date-filtered, org-scoped).
   *  2. Fetch pre-computed totals from session_summaries for those IDs.
   *  3. Aggregate expenses within the same date range.
   *  4. All aggregation happens in application memory — rows are minimal and bounded.
   */
  async getOrgSummary(
    request: FastifyRequest,
    from: string | undefined,
    to: string | undefined,
  ): Promise<OrgSummaryData> {
    validateDateRange(from, to);

    // Step 1: sessions in range — includes pre-computed distance and duration
    const sessions = await analyticsRepository.getSessionsInRange(
      request,
      from,
      to,
    );

    const totalSessions = sessions.length;
    let totalDistanceKm = 0;
    let totalDurationSeconds = 0;

    for (const row of sessions) {
      totalDistanceKm += row.total_distance_km ?? 0;
      totalDurationSeconds += row.total_duration_seconds ?? 0;
    }

    // Step 2: expense aggregation and active employee count — independent, run in parallel
    const [expenseRows, activeEmployeesCount] = await Promise.all([
      analyticsRepository.getExpensesInRange(request, from, to),
      analyticsRepository.getActiveEmployeesCount(request),
    ]);

    const { totalExpenses, approvedExpenseAmount, rejectedExpenseAmount } =
      aggregateExpenses(expenseRows);

    return {
      totalSessions,
      totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
      totalDurationSeconds,
      totalExpenses,
      approvedExpenseAmount,
      rejectedExpenseAmount,
      activeEmployeesCount,
    };
  },

  /**
   * Per-user summary for a given date range.
   *
   * Identity mapping: userIdParam is users.id (JWT sub) — must be resolved to
   * employees.id before querying employee-scoped columns.
   *
   * Process:
   *  1. Resolve users.id → employees.id (one-time lookup)
   *  2. Query sessions/expenses with resolved employees.id
   *  3. Aggregate within the date range
   *
   * Returns empty analytics response if the user has no employee record or no sessions.
   * (Admins may query analytics for users who have no employee profile, were admins,
   * or were deleted — returning 404 would be misleading.)
   */
  async getUserSummary(
    request: FastifyRequest,
    userIdParam: string,
    from: string | undefined,
    to: string | undefined,
  ): Promise<UserSummaryData> {
    validateDateRange(from, to);

    // CRITICAL: Resolve users.id → employees.id (one lookup, reused for all queries)
    const employeeId = await attendanceRepository.findEmployeeIdByUserId(
      request,
      userIdParam,
    );

    if (!employeeId) {
      // User has no employee record (e.g., admin-only user) — return empty analytics
      return {
        sessionsCount: 0,
        totalDistanceKm: 0,
        totalDurationSeconds: 0,
        totalExpenses: 0,
        approvedExpenseAmount: 0,
        averageDistancePerSession: 0,
        averageSessionDurationSeconds: 0,
      };
    }

    // Validate employeeId has sessions in this org — return empty if not
    const userExistsInOrg = await analyticsRepository.checkUserHasSessionsInOrg(
      request,
      employeeId,  // ← Now passing employees.id
    );
    if (!userExistsInOrg) {
      // Employee has no sessions — return empty analytics
      return {
        sessionsCount: 0,
        totalDistanceKm: 0,
        totalDurationSeconds: 0,
        totalExpenses: 0,
        approvedExpenseAmount: 0,
        averageDistancePerSession: 0,
        averageSessionDurationSeconds: 0,
      };
    }

    // Resolve this user's sessions in the date range — includes pre-computed metrics
    const sessions = await analyticsRepository.getSessionsForUser(
      request,
      employeeId,  // ← employees.id, resolved above
      from,
      to,
    );

    const sessionsCount = sessions.length;
    let totalDistanceKm = 0;
    let totalDurationSeconds = 0;

    for (const row of sessions) {
      totalDistanceKm += row.total_distance_km ?? 0;
      totalDurationSeconds += row.total_duration_seconds ?? 0;
    }

    // Expense aggregation for this user in the same date range
    const expenseRows = await analyticsRepository.getExpensesForUser(
      request,
      employeeId,  // ← Now passing employees.id
      from,
      to,
    );

    const { totalExpenses, approvedExpenseAmount } =
      aggregateExpenses(expenseRows);

    const averageDistancePerSession =
      sessionsCount > 0
        ? Math.round((totalDistanceKm / sessionsCount) * 100) / 100
        : 0;

    const averageSessionDurationSeconds =
      sessionsCount > 0
        ? Math.round(totalDurationSeconds / sessionsCount)
        : 0;

    return {
      sessionsCount,
      totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
      totalDurationSeconds,
      totalExpenses,
      approvedExpenseAmount,
      averageDistancePerSession,
      averageSessionDurationSeconds,
    };
  },

  /**
   * Top performers — ranked by distance, duration, or session count.
   *
   * Strategy:
   *  1. Resolve session IDs from attendance_sessions in the date range.
   *  2. Fetch session_summaries for those IDs (one pre-computed row per session).
   *  3. Group by user_id in application memory and aggregate chosen metric.
   *  4. Sort descending, slice to limit.
   *
   * session_summaries eliminates raw GPS scans — fetching 10k summary rows (one
   * per session, ~3 small numeric columns) is orders of magnitude cheaper than
   * scanning the locations table.
   */
  async getTopPerformers(
    request: FastifyRequest,
    metric: AnalyticsMetric,
    from: string | undefined,
    to: string | undefined,
    limit: number,
  ): Promise<TopPerformerEntry[]> {
    validateDateRange(from, to);

    // Resolve sessions in range — includes pre-computed distance and duration
    const sessions = await analyticsRepository.getSessionsInRange(
      request,
      from,
      to,
    );

    // Group by employee_id in a single pass — no session_summaries join needed
    const employeeMap = new Map<
      string,
      {
        totalDistanceKm: number;
        totalDurationSeconds: number;
        sessionsCount: number;
      }
    >();

    for (const row of sessions) {
      const existing = employeeMap.get(row.employee_id) ?? {
        totalDistanceKm: 0,
        totalDurationSeconds: 0,
        sessionsCount: 0,
      };
      existing.totalDistanceKm += row.total_distance_km ?? 0;
      existing.totalDurationSeconds += row.total_duration_seconds ?? 0;
      existing.sessionsCount += 1;
      employeeMap.set(row.employee_id, existing);
    }

    // Convert to array and sort descending by the chosen metric
    const entries = [...employeeMap.entries()];

    if (metric === "distance") {
      entries.sort(
        (a, b) => b[1].totalDistanceKm - a[1].totalDistanceKm,
      );
    } else if (metric === "duration") {
      entries.sort(
        (a, b) => b[1].totalDurationSeconds - a[1].totalDurationSeconds,
      );
    } else {
      // metric === "sessions"
      entries.sort((a, b) => b[1].sessionsCount - a[1].sessionsCount);
    }

    // Take top N and shape the response to only include the relevant metric field
    return entries.slice(0, limit).map(([employeeId, stats]) => {
      if (metric === "distance") {
        return {
          employeeId,
          totalDistanceKm: Math.round(stats.totalDistanceKm * 100) / 100,
        };
      }
      if (metric === "duration") {
        return {
          employeeId,
          totalDurationSeconds: stats.totalDurationSeconds,
        };
      }
      // metric === "sessions"
      return {
        employeeId,
        sessionsCount: stats.sessionsCount,
      };
    });
  },
};
