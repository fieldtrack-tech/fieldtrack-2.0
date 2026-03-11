"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { GpsLocation } from "@/types";

export function useMyRoute(sessionId: string) {
  return useQuery<GpsLocation[]>({
    queryKey: ["route", sessionId],
    queryFn: () => apiGet<GpsLocation[]>(API.route, { sessionId }),
    enabled: !!sessionId,
  });
}
