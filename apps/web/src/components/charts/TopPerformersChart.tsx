"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { TopPerformerEntry } from "@/types";
import { EmptyState } from "@/components/EmptyState";
import { BarChart3 } from "lucide-react";

interface TopPerformersChartProps {
  data: TopPerformerEntry[];
  metric: string;
}

function getMetricValue(entry: TopPerformerEntry, metric: string): number {
  if (metric === "distance") return entry.totalDistanceKm ?? 0;
  if (metric === "duration") return entry.totalDurationSeconds ?? 0;
  if (metric === "sessions") return entry.sessionsCount ?? 0;
  return 0;
}

function getMetricLabel(metric: string): string {
  if (metric === "distance") return "Distance (km)";
  if (metric === "duration") return "Duration (hrs)";
  if (metric === "sessions") return "Sessions";
  return metric;
}

export function TopPerformersChart({ data, metric }: TopPerformersChartProps) {
  if (data.length === 0) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No data available"
        description="Performance data will appear here once sessions are recorded."
      />
    );
  }

  const chartData = data.map((entry) => ({
    name: entry.employeeName ?? `Emp …${entry.employeeId.slice(-4)}`,
    value:
      metric === "duration"
        ? Number(((entry.totalDurationSeconds ?? 0) / 3600).toFixed(1))
        : getMetricValue(entry, metric),
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="name" className="text-xs fill-muted-foreground" />
        <YAxis
          className="text-xs fill-muted-foreground"
          label={{
            value: getMetricLabel(metric),
            angle: -90,
            position: "insideLeft",
            style: { fontSize: 11 },
          }}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "6px",
          }}
        />
        <Bar dataKey="value" fill="hsl(221.2 83.2% 53.3%)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
