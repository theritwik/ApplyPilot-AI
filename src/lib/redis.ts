import Redis from "ioredis";

import { env } from "@/lib/env";
import { logger } from "@/lib/logger";

const globalForRedis = globalThis as unknown as { redis?: Redis };

function createRedisClient(): Redis {
  const client = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 2,
  });

  // ioredis crashes the process on an unhandled "error" event; a listener is
  // mandatory even though the readiness check is what surfaces failures.
  client.on("error", (err) => {
    logger.error({ err }, "redis client error");
  });

  return client;
}

export const redis: Redis = globalForRedis.redis ?? createRedisClient();

if (env.NODE_ENV !== "production") {
  globalForRedis.redis = redis;
}
