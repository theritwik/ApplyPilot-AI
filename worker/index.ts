import "dotenv/config";

import { env } from "../src/lib/env";
import { logger } from "../src/lib/logger";
import { prisma } from "../src/lib/prisma";
import { redis } from "../src/lib/redis";

/**
 * Worker process skeleton (M0). Boots, holds its Postgres/Redis connections
 * open, and shuts down cleanly on SIGTERM/SIGINT. The outbox dispatcher and
 * BullMQ processors are wired up starting in M2 (docs/PLAN.md §14) — this
 * file intentionally does no queue work yet.
 */

let shuttingDown = false;

async function main(): Promise<void> {
  logger.info({ nodeEnv: env.NODE_ENV }, "worker starting");

  // Confirm Postgres/Redis are reachable at boot; a hung connection should
  // fail fast rather than leave the process silently idle.
  await prisma.$queryRaw`SELECT 1`;
  await redis.ping();

  logger.info("worker ready");
}

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;

  logger.info({ signal }, "worker shutting down");

  const results = await Promise.allSettled([redis.quit(), prisma.$disconnect()]);
  for (const result of results) {
    if (result.status === "rejected") {
      logger.error({ err: result.reason }, "error while shutting down worker dependency");
    }
  }

  logger.info("worker shutdown complete");
  process.exit(0);
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

main().catch((err: unknown) => {
  logger.error({ err }, "worker failed to start");
  process.exit(1);
});
