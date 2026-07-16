import { afterAll, beforeAll, describe, expect, it } from "vitest";

/**
 * Readiness against the real docker-compose services. Prerequisites:
 *
 *   docker compose up -d
 *   npx prisma migrate deploy
 *   npm run test:integration
 *
 * Defaults below match docker-compose.yml / .env.example and are only applied
 * when the variable is not already set.
 */

const defaults: Record<string, string> = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://applypilot:applypilot@localhost:5432/applypilot",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "applypilot-dev",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_FORCE_PATH_STYLE: "1",
};

beforeAll(() => {
  for (const [key, value] of Object.entries(defaults)) {
    process.env[key] ??= value;
  }
});

afterAll(async () => {
  const { disconnectPrisma } = await import("@/lib/prisma");
  const { closeRedis } = await import("@/lib/redis");
  await disconnectPrisma();
  await closeRedis();
});

describe("readiness against real services", () => {
  it("reports postgres, migrations, redis, and object storage individually as ok", async () => {
    const { getReadiness } = await import("@/server/health");
    const readiness = await getReadiness();

    expect(readiness.checks.postgres.status).toBe("ok");
    expect(readiness.checks.migrations.status).toBe("ok");
    expect(readiness.checks.redis.status).toBe("ok");
    expect(readiness.checks.objectStorage.status).toBe("ok");
    expect(readiness.ok).toBe(true);
  });

  it("GET /api/ready route returns 200 with per-dependency checks", async () => {
    const { GET } = await import("@/app/api/ready/route");
    const response = await GET(new Request("http://localhost:3000/api/ready"), {
      params: Promise.resolve({}),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ready");
    expect(Object.keys(body.checks).sort()).toEqual([
      "migrations",
      "objectStorage",
      "postgres",
      "redis",
    ]);
  });
});
