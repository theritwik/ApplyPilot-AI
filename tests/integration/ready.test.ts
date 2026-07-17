import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * Integration tests for GET /api/ready against real dependencies
 * (docker compose up -d, or equivalent local services — see
 * vitest.integration.config.ts).
 *
 * src/lib/{env,prisma,redis} and src/server/storage/s3-client are eager
 * module-scope singletons, so each scenario resets the module registry,
 * adjusts process.env, and re-imports the route to get a fresh dependency
 * graph. The prisma/redis modules additionally cache their clients on
 * globalThis (dev-HMR reuse), which survives vi.resetModules() — those
 * caches are cleared and the clients closed after every test so scenarios
 * stay isolated and vitest can exit.
 */

interface ReadyBody {
  status: "ok" | "error";
  checks: Record<"postgres" | "redis" | "objectStorage", { status: string; error?: string }>;
}

const MUTATED_KEYS = ["REDIS_URL", "S3_BUCKET"] as const;
const savedEnv = new Map<string, string | undefined>(
  MUTATED_KEYS.map((key) => [key, process.env[key]]),
);

async function loadReadyRoute(overrides: Partial<Record<(typeof MUTATED_KEYS)[number], string>>) {
  vi.resetModules();
  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
  return await import("@/app/api/ready/route");
}

async function callReady(overrides: Partial<Record<(typeof MUTATED_KEYS)[number], string>> = {}) {
  const { GET } = await loadReadyRoute(overrides);
  const response = await GET();
  const body = (await response.json()) as ReadyBody;
  return { response, body };
}

afterEach(async () => {
  // Close the clients cached on globalThis by the most recent module graph
  // and clear the caches so the next scenario builds fresh clients.
  const g = globalThis as Record<string, unknown>;
  const redis = g["redis"] as { disconnect(): void } | undefined;
  redis?.disconnect();
  delete g["redis"];
  const prisma = g["prisma"] as { $disconnect(): Promise<void> } | undefined;
  await prisma?.$disconnect().catch(() => undefined);
  delete g["prisma"];

  for (const [key, value] of savedEnv) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
});

describe("GET /api/ready (integration)", () => {
  it("returns 200 with every dependency ok when all are reachable", async () => {
    const { response, body } = await callReady();
    expect(body).toEqual({
      status: "ok",
      checks: {
        postgres: { status: "ok" },
        redis: { status: "ok" },
        objectStorage: { status: "ok" },
      },
    });
    expect(response.status).toBe(200);
  });

  it("returns 503 flagging only redis when redis is unreachable", async () => {
    const { response, body } = await callReady({ REDIS_URL: "redis://127.0.0.1:6390" });

    expect(response.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.checks.redis.status).toBe("error");
    expect(body.checks.postgres.status).toBe("ok");
    expect(body.checks.objectStorage.status).toBe("ok");

    // Sanitization: no connection strings, driver error codes, or stack
    // traces may leak into the response body.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("redis://");
    expect(raw).not.toContain("ECONNREFUSED");
    expect(raw).not.toContain("    at ");
  });

  it("returns 503 flagging only object storage when the bucket does not exist", async () => {
    const { response, body } = await callReady({ S3_BUCKET: "does-not-exist-bucket" });

    expect(response.status).toBe(503);
    expect(body.checks.objectStorage.status).toBe("error");
    expect(body.checks.postgres.status).toBe("ok");
    expect(body.checks.redis.status).toBe("ok");
  });
});
