import Redis from "ioredis";
import { getEnv } from "@/lib/env";

const globalForRedis = globalThis as unknown as { redis?: Redis };

/**
 * Lazy ioredis singleton. lazyConnect + no offline queue keep readiness
 * checks honest: commands fail fast instead of buffering while Redis is down.
 */
export function getRedis(): Redis {
  if (!globalForRedis.redis) {
    globalForRedis.redis = new Redis(getEnv().REDIS_URL, {
      lazyConnect: true,
      enableOfflineQueue: false,
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 200, 2_000),
    });
    // Errors are surfaced by the failing commands; this handler only prevents
    // unhandled-error crashes while Redis is unreachable.
    globalForRedis.redis.on("error", () => {});
  }
  return globalForRedis.redis;
}

export async function closeRedis(): Promise<void> {
  if (globalForRedis.redis) {
    await globalForRedis.redis.quit().catch(() => {
      globalForRedis.redis?.disconnect();
    });
    globalForRedis.redis = undefined;
  }
}
