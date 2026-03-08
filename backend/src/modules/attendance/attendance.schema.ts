import { z } from "zod";
import type { AttendanceSession } from "../../types/db.js";

// ─── Database Row Type ───────────────────────────────────

export type { AttendanceSession };

// ─── Request Schemas ─────────────────────────────────────

export const paginationSchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationSchema>;

// ─── Response Types ──────────────────────────────────────

export interface AttendanceResponse {
    success: true;
    data: AttendanceSession;
}

export interface AttendanceListResponse {
    success: true;
    data: AttendanceSession[];
}
