import { UserRole, UserPermissions } from "@/types";

export function derivePermissions(role: UserRole): UserPermissions {
  if (role === "ADMIN") {
    return {
      viewSessions: true,
      viewLocations: true,
      viewExpenses: true,
      viewAnalytics: true,
      viewOrgSessions: true,
      viewOrgExpenses: true,
      manageExpenses: true,
    };
  }

  return {
    viewSessions: true,
    viewLocations: true,
    viewExpenses: true,
    viewAnalytics: false,
    viewOrgSessions: false,
    viewOrgExpenses: false,
    manageExpenses: false,
  };
}
