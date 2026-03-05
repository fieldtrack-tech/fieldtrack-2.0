import { env } from "./env.js";

/**
 * Phase 10: Redis connection options for BullMQ Queue and Worker.
 *
 * BullMQ bundles its own ioredis internally — we pass plain connection options
 * rather than an external ioredis instance to avoid version incompatibility.
 *
 * maxRetriesPerRequest: null — required by BullMQ for blocking commands
 * enableReadyCheck: false  — prevents startup delays in containerised envs
 */
function parseRedisUrl(redisUrl: string): {
  host: string;
  port: number;
  password?: string;
  username?: string;
  db?: number;
  maxRetriesPerRequest: null;
  enableReadyCheck: false;
  tls?: Record<string, unknown>;
} {
  const u = new URL(redisUrl);

  return {
    host: u.hostname || "127.0.0.1",
    port: u.port ? parseInt(u.port, 10) : 6379,
    password: u.password || undefined,
    username: u.username || undefined,
    db: u.pathname && u.pathname.length > 1
      ? parseInt(u.pathname.slice(1), 10)
      : undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    // Enable TLS for rediss:// scheme (Redis with SSL — common in managed Redis)
    ...(u.protocol === "rediss:" ? { tls: {} } : {}),
  };
}

export const redisConnectionOptions = parseRedisUrl(env.REDIS_URL);

