import { HeadBucketCommand } from "@aws-sdk/client-s3";
import { NextResponse } from "next/server";

import { logger } from "@/lib/logger";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { s3Bucket, s3Client } from "@/server/storage/s3-client";

// Readiness: reports Postgres, Redis and object storage individually, and
// returns 503 if any one of them is unreachable. force-dynamic prevents Next
// from executing/caching this at build time (docs/PLAN.md M0 acceptance
// criteria).
export const dynamic = "force-dynamic";

const CHECK_TIMEOUT_MS = 2000;

type DependencyStatus = { status: "ok" } | { status: "error"; error: string };

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`timed out after ${ms}ms`)), ms);
    }),
  ]);
}

async function checkDependency(
  name: string,
  probe: () => Promise<unknown>,
): Promise<DependencyStatus> {
  try {
    await withTimeout(probe(), CHECK_TIMEOUT_MS);
    return { status: "ok" };
  } catch (err) {
    logger.error({ err, dependency: name }, "readiness check failed");
    return { status: "error", error: "unreachable" };
  }
}

function checkPostgres(): Promise<DependencyStatus> {
  return checkDependency("postgres", () => prisma.$queryRaw`SELECT 1`);
}

function checkRedis(): Promise<DependencyStatus> {
  return checkDependency("redis", async () => {
    const pong = await redis.ping();
    if (pong !== "PONG") {
      throw new Error(`unexpected redis ping response: ${pong}`);
    }
  });
}

function checkObjectStorage(): Promise<DependencyStatus> {
  return checkDependency("objectStorage", () =>
    s3Client.send(new HeadBucketCommand({ Bucket: s3Bucket })),
  );
}

export async function GET() {
  const [postgres, redisStatus, objectStorage] = await Promise.all([
    checkPostgres(),
    checkRedis(),
    checkObjectStorage(),
  ]);

  const checks = { postgres, redis: redisStatus, objectStorage };
  const allOk = Object.values(checks).every((check) => check.status === "ok");

  return NextResponse.json(
    { status: allOk ? "ok" : "error", checks },
    { status: allOk ? 200 : 503 },
  );
}
