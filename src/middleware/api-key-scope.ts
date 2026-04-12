import type { ApiKeyScope } from "../modules/api-keys/api-keys.schema.js";
import { ForbiddenError } from "../utils/errors.js";

function routeScope(method: string, routePath: string): ApiKeyScope | "admin:all" {
  if (method === "GET" && routePath.startsWith("/admin/employees")) return "read:employees";
  if (method === "GET" && (routePath.startsWith("/admin/sessions") || routePath === "/attendance/my-sessions")) {
    return "read:sessions";
  }
  if ((method === "POST" && routePath === "/expenses") || (method === "PATCH" && routePath.startsWith("/admin/expenses/"))) {
    return "write:expenses";
  }
  return "admin:all";
}

export function hasApiKeyScope(scopes: ApiKeyScope[], required: ApiKeyScope | "admin:all"): boolean {
  if (scopes.includes("admin:all")) return true;
  return scopes.includes(required as ApiKeyScope);
}

export function enforceApiKeyScope(method: string, routePath: string, scopes: ApiKeyScope[]): void {
  const required = routeScope(method.toUpperCase(), routePath);
  if (!hasApiKeyScope(scopes, required)) {
    throw new ForbiddenError(`API key missing required scope: ${required}`);
  }
}
