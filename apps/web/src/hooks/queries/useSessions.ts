"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGetPaginated } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { AttendanceSession, PaginatedResponse } from "@/types";

export function useMySessions(page: number, limit: number) {
  return useQuery<PaginatedResponse<AttendanceSession>>({
    queryKey: ["sessions", page, limit],
    queryFn: () =>
      apiGetPaginated<AttendanceSession>(API.sessions, {
        page: String(page),
        limit: String(limit),
      }),
  });
}

export function useOrgSessions(page: number, limit: number) {
  return useQuery<PaginatedResponse<AttendanceSession>>({
    queryKey: ["orgSessions", page, limit],
    queryFn: () =>
      apiGetPaginated<AttendanceSession>(API.orgSessions, {
        page: String(page),
        limit: String(limit),
      }),
  });
}

/**
 * Fetches a single session by ID. Checks the React Query sessions cache first;
 * if not found (e.g. direct navigation), falls back to fetching from the API.
 */
export function useMySession(id: string) {
  const queryClient = useQueryClient();
  return useQuery<AttendanceSession | undefined>({
    queryKey: ["session", id],
    queryFn: async () => {
      const allPages = queryClient.getQueriesData<PaginatedResponse<AttendanceSession>>({
        queryKey: ["sessions"],
      });
      for (const [, page] of allPages) {
        const found = page?.data?.find((s) => s.id === id);
        if (found) return found;
      }
      const result = await apiGetPaginated<AttendanceSession>(API.sessions, {
        page: "1",
        limit: "100",
      });
      return result.data.find((s) => s.id === id);
    },
    staleTime: 30_000,
  });
}
