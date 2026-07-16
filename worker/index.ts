import { getEnv } from "@/lib/env";
import { buildLogger } from "@/lib/logger";
import { disconnectPrisma, getPrisma } from "@/lib/prisma";
import { closeRedis, getRedis } from "@/lib/redis";

/**
 * Worker entry point (M0 skeleton).
 *
 * Boots with validated env, verifies PostgreSQL and Redis connectivity, and
 * idles on a heartbeat. The outbox dispatcher and the BullMQ processors
 * (resume-parse, job-analyze, suggestions, file-cleanup) arrive with M2.
 *
 * Graceful shutdown: SIGTERM/SIGINT stop the heartbeat, drain connections,
 * and exit 0; unexpected errors log fatal and exit 1.
 */

const HEARTBEAT_INTERVAL_MS = 30_000;
const SHUTDOWN_TIMEOUT_MS = 10_000;

const logger = buildLogger({ base: { app: "applypilot", process: "worker" } });

let heartbeat: NodeJS.Timeout | undefined;
let shuttingDown = false;

async function shutdown(signal: string, exitCode = 0): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ event: "worker.shutdown", signal }, "shutting down");

  const forceExit = setTimeout(() => {
    logger.error({ event: "worker.shutdown_timeout" }, "shutdown timed out; forcing exit");
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExit.unref();

  clearInterval(heartbeat);
  // M2+: stop claiming queue jobs and drain in-flight work here, before
  // closing the shared connections.
  await closeRedis().catch(() => {});
  await disconnectPrisma().catch(() => {});

  logger.info({ event: "worker.stopped" }, "worker stopped");
  process.exit(exitCode);
}

async function main(): Promise<void> {
  const env = getEnv();
  logger.info({ event: "worker.boot", nodeEnv: env.NODE_ENV }, "environment validated");

  await getPrisma().$queryRaw`SELECT 1`;
  await getRedis().connect();
  logger.info({ event: "worker.ready" }, "postgres and redis reachable; worker idle (M0 skeleton)");

  heartbeat = setInterval(() => {
    logger.debug({ event: "worker.heartbeat" }, "heartbeat");
  }, HEARTBEAT_INTERVAL_MS);

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("uncaughtException", (error) => {
    logger.fatal({ event: "worker.uncaught_exception", err: error }, "uncaught exception");
    void shutdown("uncaughtException", 1);
  });
  process.on("unhandledRejection", (reason) => {
    logger.fatal({ event: "worker.unhandled_rejection", err: reason }, "unhandled rejection");
    void shutdown("unhandledRejection", 1);
  });
}

main().catch((error: unknown) => {
  logger.fatal({ event: "worker.boot_failed", err: error }, "worker failed to start");
  process.exit(1);
});
