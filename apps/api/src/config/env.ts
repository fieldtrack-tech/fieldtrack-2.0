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
  // Domain configuration
  API_DOMAIN: string | undefined;
  FRONTEND_DOMAIN: string | undefined;
  // Tracing export target
  TEMPO_ENDPOINT: string | undefined;
  // Worker / computation safety limits
  MAX_QUEUE_DEPTH: number;
  MAX_POINTS_PER_SESSION: number;
  MAX_SESSION_DURATION_HOURS: number;
  // Phase 18: Worker concurrency
  WORKER_CONCURRENCY: number;
  // Prometheus scrape token — when set, /metrics requires Authorization: Bearer <token> header.
  // Leave unset in development/test to keep the endpoint open.
  METRICS_SCRAPE_TOKEN: string | undefined;
  // HTTP limits (externalized)
  BODY_LIMIT_BYTES: number;
  REQUEST_TIMEOUT_MS: number;
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

  API_DOMAIN: process.env["API_DOMAIN"] || undefined,
  FRONTEND_DOMAIN: process.env["FRONTEND_DOMAIN"] || undefined,

  // OTLP HTTP endpoint. Defaults in tracing.ts when unset.
  TEMPO_ENDPOINT: process.env["TEMPO_ENDPOINT"] || undefined,

  // Maximum number of sessions that may sit in the worker queue at once.
  MAX_QUEUE_DEPTH: getOptionalInt("MAX_QUEUE_DEPTH", 1_000),

  // Maximum GPS points allowed per session recalculation before the job is
  // rejected. Guards against pathological data saturating the event loop.
  // Admins can force recalculation beyond this limit via a future flag.
  MAX_POINTS_PER_SESSION: getOptionalInt("MAX_POINTS_PER_SESSION", 50_000),

  // Sessions longer than this many hours are considered data-integrity anomalies
  // and are rejected from recalculation (e.g. an un-closed dev session).
  MAX_SESSION_DURATION_HOURS: getOptionalInt("MAX_SESSION_DURATION_HOURS", 168),

  // Phase 18: Number of concurrent jobs the distance worker processes.
  // Default 1 ensures sequential processing. Increase for horizontal scaling.
  WORKER_CONCURRENCY: getOptionalInt("WORKER_CONCURRENCY", 1),

  // Prometheus scrape protection.  Set this in production and configure the
  // same value in Prometheus scrape_configs as a custom request_header.
  // MUST be set in production or app will fail to start.
  METRICS_SCRAPE_TOKEN: process.env["METRICS_SCRAPE_TOKEN"] || undefined,

  // HTTP limits (externalized for environment-specific tuning)
  BODY_LIMIT_BYTES: getOptionalInt("BODY_LIMIT_BYTES", 1_000_000),
  REQUEST_TIMEOUT_MS: getOptionalInt("REQUEST_TIMEOUT_MS", 30_000),
};

// Production safety check: METRICS_SCRAPE_TOKEN must be set
if (env.NODE_ENV === "production" && !env.METRICS_SCRAPE_TOKEN) {
  throw new Error(
    "METRICS_SCRAPE_TOKEN must be set in production to protect /metrics endpoint"
  );
}

// Production safety check: ALLOWED_ORIGINS must be set
// An empty ALLOWED_ORIGINS causes the CORS plugin to fall back to `origin: true`,
// which allows all origins and opens the API to cross-site credential abuse.
if (env.NODE_ENV === "production" && env.ALLOWED_ORIGINS.length === 0) {
  throw new Error(
    "ALLOWED_ORIGINS must be set in production to prevent cross-origin credential abuse"
  );
}
