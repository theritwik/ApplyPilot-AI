import { Prisma } from "@prisma/client";
import { getPrisma } from "@/lib/prisma";
import { getRedis } from "@/lib/redis";
import { checkObjectStorage } from "@/server/storage/s3";

/**
 * Readiness checks (§6 of docs/PLAN.md): PostgreSQL, applied migrations,
 * Redis, and object storage are probed individually so /api/ready can report
 * each dependency's status and return 503 when any one of them is down.
 */

const CHECK_TIMEOUT_MS = 2_000;

export type CheckName = "postgres" | "migrations" | "redis" | "objectStorage";

export interface CheckResult {
  status: "ok" | "error";
  latencyMs: number;
  error?: string;
}

export interface Readiness {
  ok: boolean;
  checks: Record<CheckName, CheckResult>;
}

export type CheckFns = Record<CheckName, () => Promise<void>>;

async function withTimeout(run: () => Promise<void>, timeoutMs: number): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      run(),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${timeoutMs}ms`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function checkPostgres(): Promise<void> {
  await getPrisma().$queryRaw`SELECT 1`;
}

async function checkMigrations(): Promise<void> {
  const rows = await getPrisma().$queryRaw<
    Array<{ pending: bigint }>
  >`SELECT count(*)::bigint AS pending FROM "_prisma_migrations" WHERE "finished_at" IS NULL AND "rolled_back_at" IS NULL`;
  const pending = rows[0]?.pending ?? 0n;
  if (pending > 0n) {
    throw new Error(`${pending} migration(s) unfinished`);
  }
  const applied = await getPrisma().$queryRaw<
    Array<{ applied: bigint }>
  >`SELECT count(*)::bigint AS applied FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`;
  if ((applied[0]?.applied ?? 0n) === 0n) {
    throw new Error("no migrations applied");
  }
}

async function checkRedis(): Promise<void> {
  const redis = getRedis();
  if (redis.status !== "ready") {
    // lazyConnect: establish the connection on first use / after a drop.
    await redis.connect().catch((error: unknown) => {
      // "already connecting/connected" races are fine; ping decides below.
      if (!(error instanceof Error) || !/already/i.test(error.message)) {
        throw error;
      }
    });
  }
  const pong = await redis.ping();
  if (pong !== "PONG") {
    throw new Error(`unexpected ping reply: ${pong}`);
  }
}

const defaultChecks: CheckFns = {
  postgres: checkPostgres,
  migrations: checkMigrations,
  redis: checkRedis,
  objectStorage: checkObjectStorage,
};

function sanitizeCheckError(name: CheckName, error: unknown): string {
  // Known-safe, dependency-shaped failures only; no connection strings.
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    return `database error ${error.code}`;
  }
  if (error instanceof Error && /timed out|migration|ping|no migrations/.test(error.message)) {
    return error.message;
  }
  return `${name} unreachable`;
}

export async function getReadiness(checks: CheckFns = defaultChecks): Promise<Readiness> {
  const names = Object.keys(checks) as CheckName[];
  const results = await Promise.all(
    names.map(async (name) => {
      const startedAt = Date.now();
      try {
        await withTimeout(checks[name], CHECK_TIMEOUT_MS);
        return [name, { status: "ok", latencyMs: Date.now() - startedAt }] as const;
      } catch (error) {
        return [
          name,
          {
            status: "error",
            latencyMs: Date.now() - startedAt,
            error: sanitizeCheckError(name, error),
          },
        ] as const;
      }
    }),
  );

  const checkResults = Object.fromEntries(results) as Record<CheckName, CheckResult>;
  return {
    ok: results.every(([, result]) => result.status === "ok"),
    checks: checkResults,
  };
}
