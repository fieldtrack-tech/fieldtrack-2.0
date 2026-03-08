import type { Database } from "./database.js";

// ─── Table Row types ──────────────────────────────────────────────────────────

export type Organization = Database["public"]["Tables"]["organizations"]["Row"];
export type OrganizationInsert = Database["public"]["Tables"]["organizations"]["Insert"];
export type OrganizationUpdate = Database["public"]["Tables"]["organizations"]["Update"];

export type User = Database["public"]["Tables"]["users"]["Row"];
export type UserInsert = Database["public"]["Tables"]["users"]["Insert"];
export type UserUpdate = Database["public"]["Tables"]["users"]["Update"];

export type Employee = Database["public"]["Tables"]["employees"]["Row"];
export type EmployeeInsert = Database["public"]["Tables"]["employees"]["Insert"];
export type EmployeeUpdate = Database["public"]["Tables"]["employees"]["Update"];

export type AttendanceSession = Database["public"]["Tables"]["attendance_sessions"]["Row"];
export type AttendanceSessionInsert = Database["public"]["Tables"]["attendance_sessions"]["Insert"];
export type AttendanceSessionUpdate = Database["public"]["Tables"]["attendance_sessions"]["Update"];

export type GpsLocation = Database["public"]["Tables"]["gps_locations"]["Row"];
export type GpsLocationInsert = Database["public"]["Tables"]["gps_locations"]["Insert"];
export type GpsLocationUpdate = Database["public"]["Tables"]["gps_locations"]["Update"];

export type Expense = Database["public"]["Tables"]["expenses"]["Row"];
export type ExpenseInsert = Database["public"]["Tables"]["expenses"]["Insert"];
export type ExpenseUpdate = Database["public"]["Tables"]["expenses"]["Update"];

export type SessionSummaryRow = Database["public"]["Tables"]["session_summaries"]["Row"];
export type SessionSummaryInsert = Database["public"]["Tables"]["session_summaries"]["Insert"];
export type SessionSummaryUpdate = Database["public"]["Tables"]["session_summaries"]["Update"];

// ─── Enum types ───────────────────────────────────────────────────────────────

export type UserRole = Database["public"]["Enums"]["user_role"];
export type ExpenseStatus = Database["public"]["Enums"]["expense_status"];
export type DistanceJobStatus = Database["public"]["Enums"]["distance_job_status"];
