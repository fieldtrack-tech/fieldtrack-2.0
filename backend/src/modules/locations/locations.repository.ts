import { supabaseAnonClient as supabase } from "../../config/supabase.js";
import { enforceTenant } from "../../utils/tenant.js";
import { applyPagination } from "../../utils/pagination.js";
import type { FastifyRequest } from "fastify";
import type { LocationRecord, CreateLocationBody } from "./locations.schema.js";

/**
 * Locations repository — Supabase queries for gps_locations.
 *
 * Phase 16 confirmed column set:
 *   id, organization_id, session_id, employee_id,
 *   latitude, longitude, accuracy, recorded_at,
 *   sequence_number, is_duplicate
 *
 * organization_id on the table enables direct enforceTenant() filtering
 * without joins to attendance_sessions.
 */
export const locationsRepository = {
    async createLocation(
        request: FastifyRequest,
        employeeId: string,
        sessionId: string,
        data: CreateLocationBody,
    ): Promise<LocationRecord> {
        const { data: record, error } = await supabase
            .from("gps_locations")
            .upsert(
                {
                    organization_id: request.organizationId,
                    session_id: sessionId,
                    employee_id: employeeId,
                    latitude: data.latitude,
                    longitude: data.longitude,
                    accuracy: data.accuracy,
                    recorded_at: data.recorded_at,
                },
                { onConflict: "session_id, recorded_at", ignoreDuplicates: true },
            )
            .select("id, organization_id, session_id, employee_id, latitude, longitude, accuracy, recorded_at, sequence_number, is_duplicate")
            .single();

        if (error) {
            throw new Error(`Failed to insert location: ${error.message}`);
        }
        return record as LocationRecord;
    },

    async createLocationBatch(
        request: FastifyRequest,
        employeeId: string,
        sessionId: string,
        points: Omit<CreateLocationBody, "session_id">[],
    ): Promise<number> {
        const rows = points.map((p) => ({
            organization_id: request.organizationId,
            session_id: sessionId,
            employee_id: employeeId,
            latitude: p.latitude,
            longitude: p.longitude,
            accuracy: p.accuracy,
            recorded_at: p.recorded_at,
        }));

        const { data, error } = await supabase
            .from("gps_locations")
            .upsert(rows, { onConflict: "session_id, recorded_at", ignoreDuplicates: true })
            .select("id");

        if (error) {
            throw new Error(`Failed to bulk insert locations: ${error.message}`);
        }
        return data?.length ?? 0;
    },

    async findLocationsBySession(
        request: FastifyRequest,
        sessionId: string,
        employeeId?: string,
    ): Promise<LocationRecord[]> {
        let baseQuery = supabase
            .from("gps_locations")
            .select("id, organization_id, session_id, employee_id, latitude, longitude, accuracy, recorded_at, sequence_number, is_duplicate")
            .eq("session_id", sessionId)
            .order("recorded_at", { ascending: true });

        if (employeeId !== undefined) {
            baseQuery = baseQuery.eq("employee_id", employeeId) as typeof baseQuery;
        }

        const { data, error } = await enforceTenant(request, baseQuery);

        if (error) {
            throw new Error(`Failed to fetch location history: ${error.message}`);
        }
        return (data ?? []) as LocationRecord[];
    },

    async findPointsForDistancePaginated(
        request: FastifyRequest,
        sessionId: string,
        page: number,
        limit: number,
    ): Promise<{ latitude: number; longitude: number; recorded_at: string }[]> {
        const baseQuery = supabase
            .from("gps_locations")
            .select("latitude, longitude, recorded_at")
            .eq("session_id", sessionId)
            .order("recorded_at", { ascending: true });

        const { data, error } = await applyPagination(
            enforceTenant(request, baseQuery),
            page,
            limit,
        );

        if (error) {
            throw new Error(`Failed to fetch paginated points for distance: ${error.message}`);
        }
        return data ?? [];
    },
};
