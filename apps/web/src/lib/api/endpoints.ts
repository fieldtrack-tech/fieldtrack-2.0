/**
 * Centralised API endpoint paths.
 * All query hooks must import paths from here instead of inlining strings.
 */
export const API = {
  // Sessions (attendance)
  sessions: "/attendance/my-sessions",
  orgSessions: "/attendance/org-sessions",

  // Locations (GPS route)
  route: "/locations/my-route",

  // Expenses
  expenses: "/expenses/my",
  orgExpenses: "/admin/expenses",
  expenseStatus: (id: string) => `/admin/expenses/${id}`,

  // Analytics
  orgSummary: "/admin/org-summary",
  topPerformers: "/admin/top-performers",
} as const;
