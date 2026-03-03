import type { FastifyRequest } from "fastify";

/**
 * Enforces tenant isolation by scoping a Supabase query to the
 * authenticated user's organization_id.
 *
 * Uses a structural type that matches Supabase's query builder
 * without importing its complex generic chain.
 *
 * Usage:
 *   const query = supabase.from("expenses").select("*");
 *   const { data, error } = await enforceTenant(request, query);
 */
interface TenantScopable {
    eq(column: string, value: string): this;
}

export function enforceTenant<T extends TenantScopable>(
    request: FastifyRequest,
    query: T,
): T {
    return query.eq("organization_id", request.organizationId);
}
