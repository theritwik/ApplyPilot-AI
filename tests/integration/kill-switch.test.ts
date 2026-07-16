import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * §16 integration test #11: booting env validation with NODE_ENV=production
 * and E2E_TEST_MODE=1 throws — asserted against a real fresh process running
 * the same validation the app runs at startup.
 */

const repoRoot = path.resolve(__dirname, "..", "..");
const tsx = path.join(repoRoot, "node_modules", ".bin", "tsx");
const bootScript = path.join(__dirname, "helpers", "boot-env.ts");

const baseEnv: Record<string, string | undefined> = {
  PATH: process.env.PATH,
  APP_URL: "https://applypilot.example",
  DATABASE_URL: "postgresql://user:pass@db.example:5432/applypilot",
  REDIS_URL: "redis://redis.example:6379",
  S3_ENDPOINT: "https://storage.example",
  S3_REGION: "auto",
  S3_BUCKET: "applypilot",
  S3_ACCESS_KEY_ID: "key",
  S3_SECRET_ACCESS_KEY: "secret",
};

function boot(env: NodeJS.ProcessEnv) {
  return spawnSync(tsx, [bootScript], {
    cwd: repoRoot,
    env,
    encoding: "utf8",
    timeout: 60_000,
  });
}

describe("production E2E_TEST_MODE kill switch (fresh process)", () => {
  it("fails startup when NODE_ENV=production and E2E_TEST_MODE=1", () => {
    const result = boot({ ...baseEnv, NODE_ENV: "production", E2E_TEST_MODE: "1" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("E2E_TEST_MODE");
    expect(result.stdout).not.toContain("ENV_OK");
  });

  it("boots cleanly in production without E2E_TEST_MODE", () => {
    const result = boot({ ...baseEnv, NODE_ENV: "production" });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("ENV_OK");
  });

  it("fails startup naming the missing variable in a fresh process", () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = baseEnv;
    const result = boot({ ...withoutDb, NODE_ENV: "production" });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DATABASE_URL");
  });
});
