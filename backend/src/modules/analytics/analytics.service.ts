import type { FastifyRequest } from "fastify";
import { analyticsRepository } from "./analytics.repository.js";
import { BadRequestError, NotFoundError } from "../../utils/errors.js";
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
 * All reads use session_summaries (pre-computed) over attendance_sessions
 * for distance and duration — this avoids scanning the raw locations table
 * which can hold tens of thousands of rows per session.
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

    // Step 1: resolve sessions in range — returns only {id, user_id}
    const sessions = await analyticsRepository.getSessionsInRange(
      request,
      from,
      to,
    );

    const totalSessions = sessions.length;
    const sessionIds = sessions.map((s) => s.id);

    // Step 2: session-level distance and duration from pre-computed summaries
    const summaries = await analyticsRepository.getSummariesForSessions(
      request,
      sessionIds,
    );

    let totalDistanceKm = 0;
    let totalDurationSeconds = 0;
    const activeEmployeeIds = new Set<string>();

    // Group by session_id from summary rows; employee identity resolved via sessions map
    const sessionToEmployee = new Map(sessions.map((s) => [s.id, s.employee_id]));

    for (const row of summaries) {
      totalDistanceKm += row.total_distance_km;
      totalDurationSeconds += row.total_duration_seconds;
      const empId = sessionToEmployee.get(row.session_id);
      if (empId) activeEmployeeIds.add(empId);
    }

    // Step 3: expense aggregation in same date range
    const expenseRows = await analyticsRepository.getExpensesInRange(
      request,
      from,
      to,
    );

    const { totalExpenses, approvedExpenseAmount, rejectedExpenseAmount } =
      aggregateExpenses(expenseRows);

    return {
      totalSessions,
      totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
      totalDurationSeconds,
      totalExpenses,
      approvedExpenseAmount,
      rejectedExpenseAmount,
      activeEmployeesCount: activeEmployeeIds.size,
    };
  },

  /**
   * Per-user summary for a given date range.
   *
   * Validates that the userId belongs to this organization before running
   * the aggregation queries (prevents returning zeros that could be confused
   * with legitimate zero-activity data for a foreign userId).
   */
  async getUserSummary(
    request: FastifyRequest,
    userId: string,
    from: string | undefined,
    to: string | undefined,
  ): Promise<UserSummaryData> {
    validateDateRange(from, to);

    // Validate userId exists in this org — throws NotFoundError if not
    const userExistsInOrg = await analyticsRepository.checkUserHasSessionsInOrg(
      request,
      userId,
    );
    if (!userExistsInOrg) {
      throw new NotFoundError(
        "No sessions found for this user in your organization",
      );
    }

    // Resolve this user's sessions in the date range
    const sessions = await analyticsRepository.getSessionsForUser(
      request,
      userId,
      from,
      to,
    );

    const sessionsCount = sessions.length;
    const sessionIds = sessions.map((s) => s.id);

    // Session-level metrics from pre-computed summaries
    const summaries = await analyticsRepository.getSummariesForSessions(
      request,
      sessionIds,
    );

    let totalDistanceKm = 0;
    let totalDurationSeconds = 0;

    for (const row of summaries) {
      totalDistanceKm += row.total_distance_km;
      totalDurationSeconds += row.total_duration_seconds;
    }

    // Expense aggregation for this user in the same date range
    const expenseRows = await analyticsRepository.getExpensesForUser(
      request,
      userId,
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

    // Resolve sessions in range
    const sessions = await analyticsRepository.getSessionsInRange(
      request,
      from,
      to,
    );

    const sessionIds = sessions.map((s) => s.id);

    // Fetch minimal summary rows — only what aggregation needs
    const summaries = await analyticsRepository.getSummariesForSessions(
      request,
      sessionIds,
    );

    // Group by session_id then join to employee via sessions map — O(n) single pass
    const sessionToEmployee = new Map(sessions.map((s) => [s.id, s.employee_id]));
    const employeeMap = new Map<
      string,
      {
        totalDistanceKm: number;
        totalDurationSeconds: number;
        sessionsCount: number;
      }
    >();

    for (const row of summaries) {
      const employeeId = sessionToEmployee.get(row.session_id);
      if (!employeeId) continue;
      const existing = employeeMap.get(employeeId) ?? {
        totalDistanceKm: 0,
        totalDurationSeconds: 0,
        sessionsCount: 0,
      };
      existing.totalDistanceKm += row.total_distance_km;
      existing.totalDurationSeconds += row.total_duration_seconds;
      existing.sessionsCount += 1;
      employeeMap.set(employeeId, existing);
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
