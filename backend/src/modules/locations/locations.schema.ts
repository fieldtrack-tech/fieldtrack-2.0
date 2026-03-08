import { z } from "zod";
import type { GpsLocation } from "../../types/db.js";

// ─── Database Row Type ───────────────────────────────────
// Phase 16 — confirmed final schema for gps_locations.
//
// organization_id is included for direct enforceTenant() filtering,
// avoiding a JOIN to attendance_sessions on every location query.

export type LocationRecord = GpsLocation;

// ─── Request Schemas ─────────────────────────────────────

const TWO_MINUTES_MS = 2 * 60 * 1000;

export const createLocationSchema = z.object({
    session_id: z.string().uuid("session_id must be a valid UUID"),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    accuracy: z.number().min(0),
    recorded_at: z.string().datetime().refine((val) => {
        const recordedTime = new Date(val).getTime();
        const now = Date.now();
        return recordedTime <= now + TWO_MINUTES_MS;
    }, "recorded_at cannot be more than 2 minutes in the future"),
});

export type CreateLocationBody = z.infer<typeof createLocationSchema>;

export const createLocationBatchSchema = z.object({
    session_id: z.string().uuid("session_id must be a valid UUID"),
    points: z.array(createLocationSchema.omit({ session_id: true })).min(1).max(100),
});

export type CreateLocationBatchBody = z.infer<typeof createLocationBatchSchema>;

export const sessionQuerySchema = z.object({
    sessionId: z.string().uuid("sessionId must be a valid UUID"),
});

export type SessionQuery = z.infer<typeof sessionQuerySchema>;

// ─── Response Types ──────────────────────────────────────

export interface LocationResponse {
    success: true;
    data: LocationRecord;
}

export interface LocationListResponse {
    success: true;
    data: LocationRecord[];
}

export interface LocationBatchResponse {
    success: true;
    inserted: number;
}
