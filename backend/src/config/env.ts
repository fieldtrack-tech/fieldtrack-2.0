import dotenv from "dotenv";

dotenv.config();

interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_JWT_SECRET: string;
  // Phase 10: Durable queue
  REDIS_URL: string;
  // Phase 10: HTTP security
  ALLOWED_ORIGINS: string[];
  // Worker / computation safety limits
  MAX_QUEUE_DEPTH: number;
  MAX_POINTS_PER_SESSION: number;
  MAX_SESSION_DURATION_HOURS: number;
}

function getEnvVar(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function getOptionalInt(key: string, defaultValue: number): number {
  const raw = process.env[key];
  if (!raw) return defaultValue;
  const parsed = parseInt(raw, 10);
  if (isNaN(parsed) || parsed <= 0) {
    throw new Error(
      `Environment variable ${key} must be a positive integer, got: "${raw}"`,
    );
  }
  return parsed;
}

export const env: EnvConfig = {
  PORT: parseInt(process.env["PORT"] ?? "3000", 10),
  NODE_ENV: process.env["NODE_ENV"] ?? "development",
  SUPABASE_URL: getEnvVar("SUPABASE_URL"),
  SUPABASE_SERVICE_ROLE_KEY: getEnvVar("SUPABASE_SERVICE_ROLE_KEY"),
  SUPABASE_ANON_KEY: getEnvVar("SUPABASE_ANON_KEY"),
  SUPABASE_JWT_SECRET: getEnvVar("SUPABASE_JWT_SECRET"),

  // Phase 10: Redis connection URL for BullMQ durable queue
  REDIS_URL: getEnvVar("REDIS_URL"),

  // Phase 10: Comma-separated list of allowed CORS origins
  ALLOWED_ORIGINS: (process.env["ALLOWED_ORIGINS"] ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean),

  // Maximum number of sessions that may sit in the worker queue at once.
  MAX_QUEUE_DEPTH: getOptionalInt("MAX_QUEUE_DEPTH", 1_000),

  // Maximum GPS points allowed per session recalculation before the job is
  // rejected. Guards against pathological data saturating the event loop.
  // Admins can force recalculation beyond this limit via a future flag.
  MAX_POINTS_PER_SESSION: getOptionalInt("MAX_POINTS_PER_SESSION", 50_000),

  // Sessions longer than this many hours are considered data-integrity anomalies
  // and are rejected from recalculation (e.g. an un-closed dev session).
  MAX_SESSION_DURATION_HOURS: getOptionalInt("MAX_SESSION_DURATION_HOURS", 168),
};
