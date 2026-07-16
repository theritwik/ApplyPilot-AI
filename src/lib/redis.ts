import { Redis } from "ioredis";
import { getEnv } from "./env";

/**
 * Lazily constructed shared Redis connection (ioredis).
 * BullMQ (M2) will create its own connections; this singleton is for
 * application-level use (rate limiting, ad-hoc commands).
 *
 * Readiness checks intentionally do NOT use this singleton — they create
 * short-lived connections with strict timeouts (src/server/health/checks.ts).
 */

const globalCache = globalThis as unknown as { __applypilotRedis?: Redis };

export function getRedis(): Redis {
  if (!globalCache.__applypilotRedis) {
    globalCache.__applypilotRedis = new Redis(getEnv().REDIS_URL, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
    });
  }
  return globalCache.__applypilotRedis;
}
