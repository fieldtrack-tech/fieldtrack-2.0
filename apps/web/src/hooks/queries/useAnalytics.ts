"use client";

import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { apiGet } from "@/lib/api/client";
import { API } from "@/lib/api/endpoints";
import { OrgSummaryData, TopPerformerEntry, SessionTrendEntry, LeaderboardEntry } from "@/types";

export function useOrgSummary(from?: string, to?: string, enabled = true) {
  return useQuery<OrgSummaryData>({
    queryKey: ["orgSummary", from, to],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (from) params["from"] = from;
      if (to) params["to"] = to;
      return apiGet<OrgSummaryData>(API.orgSummary, params);
    },
    enabled,
    staleTime: 30_000,        // dashboard stats: fresh for 30s
    placeholderData: keepPreviousData,
  });
}

export function useTopPerformers(
  metric: string,
  limit?: number,
  from?: string,
  to?: string
) {
  return useQuery<TopPerformerEntry[]>({
    queryKey: ["topPerformers", metric, limit, from, to],
    queryFn: () => {
      const params: Record<string, string> = { metric };
      if (limit) params["limit"] = String(limit);
      if (from) params["from"] = from;
      if (to) params["to"] = to;
      return apiGet<TopPerformerEntry[]>(API.topPerformers, params);
    },
    staleTime: 60_000,        // chart data: fresh for 1 min
    placeholderData: keepPreviousData,
  });
}

export function useSessionTrend(from?: string, to?: string) {
  return useQuery<SessionTrendEntry[]>({
    queryKey: ["sessionTrend", from, to],
    queryFn: () => {
      const params: Record<string, string> = {};
      if (from) params["from"] = from;
      if (to) params["to"] = to;
      return apiGet<SessionTrendEntry[]>(API.sessionTrend, params);
    },
    staleTime: 60_000,        // trend chart: fresh for 1 min
    placeholderData: keepPreviousData,
  });
}

export function useLeaderboard(
  metric: string,
  limit?: number,
  from?: string,
  to?: string
) {
  return useQuery<LeaderboardEntry[]>({
    queryKey: ["leaderboard", metric, limit, from, to],
    queryFn: () => {
      const params: Record<string, string> = { metric };
      if (limit) params["limit"] = String(limit);
      if (from) params["from"] = from;
      if (to) params["to"] = to;
      return apiGet<LeaderboardEntry[]>(API.leaderboard, params);
    },
    staleTime: 120_000,       // ranking: fresh for 2 min (slow-moving)
    placeholderData: keepPreviousData,
  });
}
