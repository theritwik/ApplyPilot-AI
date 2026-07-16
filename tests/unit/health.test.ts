import { describe, expect, it, vi } from "vitest";
import { getReadiness, type CheckFns } from "@/server/health";

function checks(overrides: Partial<CheckFns> = {}): CheckFns {
  const ok = () => Promise.resolve();
  return {
    postgres: ok,
    migrations: ok,
    redis: ok,
    objectStorage: ok,
    ...overrides,
  };
}

describe("getReadiness", () => {
  it("is ok when every dependency check passes", async () => {
    const readiness = await getReadiness(checks());
    expect(readiness.ok).toBe(true);
    expect(readiness.checks.postgres.status).toBe("ok");
    expect(readiness.checks.migrations.status).toBe("ok");
    expect(readiness.checks.redis.status).toBe("ok");
    expect(readiness.checks.objectStorage.status).toBe("ok");
  });

  it("reports each failing dependency individually and flips ok to false", async () => {
    const readiness = await getReadiness(
      checks({ redis: () => Promise.reject(new Error("connect ECONNREFUSED")) }),
    );
    expect(readiness.ok).toBe(false);
    expect(readiness.checks.redis.status).toBe("error");
    expect(readiness.checks.postgres.status).toBe("ok");
    expect(readiness.checks.objectStorage.status).toBe("ok");
  });

  it("never leaks raw connection errors to the response", async () => {
    const readiness = await getReadiness(
      checks({
        postgres: () =>
          Promise.reject(new Error("password authentication failed for user applypilot")),
      }),
    );
    expect(readiness.checks.postgres.error).toBe("postgres unreachable");
    expect(JSON.stringify(readiness)).not.toContain("password");
  });

  it("surfaces migration problems as check errors", async () => {
    const readiness = await getReadiness(
      checks({ migrations: () => Promise.reject(new Error("no migrations applied")) }),
    );
    expect(readiness.ok).toBe(false);
    expect(readiness.checks.migrations.error).toBe("no migrations applied");
  });

  it("times out hung checks instead of hanging the endpoint", async () => {
    vi.useFakeTimers();
    try {
      const pending = getReadiness(checks({ objectStorage: () => new Promise<void>(() => {}) }));
      await vi.advanceTimersByTimeAsync(2_100);
      const readiness = await pending;
      expect(readiness.ok).toBe(false);
      expect(readiness.checks.objectStorage.error).toMatch(/timed out/);
    } finally {
      vi.useRealTimers();
    }
  });
});
