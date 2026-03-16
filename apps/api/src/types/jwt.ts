import { z } from "zod";

const ROLES = ["ADMIN", "EMPLOYEE", "SUPERVISOR", "FINANCE", "TEAM_LEAD"] as const;

/**
 * Strict schema for validating decoded JWT payloads.
 * Every request must carry a valid sub, role (from user_metadata), and organization_id.
 * 
 * Phase 20: Updated to extract role from user_metadata.role instead of top-level role.
 * The top-level role is always "authenticated" and should be ignored.
 */
export const jwtPayloadSchema = z.object({
    sub: z.string().min(1, "JWT 'sub' claim is required"),
    email: z.string().email().optional(),
    role: z.enum(ROLES, {
        error: "Role must be ADMIN, EMPLOYEE, SUPERVISOR, FINANCE, or TEAM_LEAD",
    }),
    organization_id: z.string().uuid({ error: "organization_id must be a valid UUID" }),
});

export type JwtPayload = z.infer<typeof jwtPayloadSchema>;
