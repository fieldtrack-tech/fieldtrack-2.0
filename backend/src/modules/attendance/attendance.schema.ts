import { z } from "zod";

// ─── Database Row Type ───────────────────────────────────

export interface AttendanceSession {
    id: string;
    user_id: string;
    organization_id: string;
    check_in_at: string;
    check_out_at: string | null;
    created_at: string;
    updated_at: string;
}

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
