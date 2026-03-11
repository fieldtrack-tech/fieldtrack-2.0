"use client";

import { useQuery } from "@tanstack/react-query";
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
