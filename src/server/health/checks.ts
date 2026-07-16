import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { Redis } from "ioredis";
import { getEnv } from "../../lib/env";
import { logger } from "../../lib/logger";
import { getPrisma } from "../../lib/prisma";
import { getS3 } from "../storage/s3";

/**
 * Readiness checks (docs/PLAN.md §3, §18 M0).
 *
 * Each dependency is checked independently with a strict timeout and reports
 * only "ok" | "error" — raw error messages can contain connection strings, so
 * they go to the (redacted) server log, never into the HTTP response.
 */

export type CheckStatus = "ok" | "error";

export interface ReadinessChecks {
  postgres: CheckStatus;
  redis: CheckStatus;
  objectStorage: CheckStatus;
}

const CHECK_TIMEOUT_MS = 2_500;

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} check timed out after ${CHECK_TIMEOUT_MS}ms`)),
          CHECK_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkPostgres(): Promise<CheckStatus> {
  try {
    await withTimeout(getPrisma().$queryRaw`SELECT 1`, "postgres");
    return "ok";
  } catch (err) {
    logger.warn({ err, check: "postgres" }, "readiness check failed");
    return "error";
  }
}

export async function checkRedis(): Promise<CheckStatus> {
  // Short-lived connection so a down Redis fails fast instead of queueing.
  const client = new Redis(getEnv().REDIS_URL, {
    lazyConnect: true,
    connectTimeout: CHECK_TIMEOUT_MS - 500,
    maxRetriesPerRequest: 0,
    retryStrategy: () => null,
    enableOfflineQueue: false,
  });
  try {
    await withTimeout(
      client.connect().then(() => client.ping()),
      "redis",
    );
    return "ok";
  } catch (err) {
    logger.warn({ err, check: "redis" }, "readiness check failed");
    return "error";
  } finally {
    client.disconnect();
  }
}

export async function checkObjectStorage(): Promise<CheckStatus> {
  try {
    await withTimeout(
      getS3().send(new HeadBucketCommand({ Bucket: getEnv().S3_BUCKET })),
      "objectStorage",
    );
    return "ok";
  } catch (err) {
    logger.warn({ err, check: "objectStorage" }, "readiness check failed");
    return "error";
  }
}

export async function runReadinessChecks(): Promise<ReadinessChecks> {
  const [postgres, redis, objectStorage] = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkObjectStorage(),
  ]);
  return { postgres, redis, objectStorage };
}
