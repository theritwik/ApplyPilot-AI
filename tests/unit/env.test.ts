import { describe, expect, it } from "vitest";

import { loadEnv } from "@/lib/env";

const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
  E2E_TEST_MODE: "0",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://applypilot:applypilot@localhost:5432/applypilot",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "applypilot-dev",
  S3_ACCESS_KEY_ID: "applypilot",
  S3_SECRET_ACCESS_KEY: "applypilot-secret",
  S3_FORCE_PATH_STYLE: "true",
  LOG_LEVEL: "info",
};

describe("loadEnv", () => {
  it("parses a complete, valid environment", () => {
    const env = loadEnv(validEnv);
    expect(env.NODE_ENV).toBe("development");
    expect(env.DATABASE_URL).toBe(validEnv.DATABASE_URL);
    expect(env.S3_FORCE_PATH_STYLE).toBe("true");
  });

  it("applies defaults for optional vars", () => {
    const { NODE_ENV, E2E_TEST_MODE, S3_FORCE_PATH_STYLE, LOG_LEVEL, ...rest } = validEnv;
    const env = loadEnv(rest);
    expect(env.NODE_ENV).toBe("development");
    expect(env.E2E_TEST_MODE).toBe("0");
    expect(env.S3_FORCE_PATH_STYLE).toBe("false");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("fails startup naming the missing required variable", () => {
    const { DATABASE_URL, ...withoutDatabaseUrl } = validEnv;
    expect(() => loadEnv(withoutDatabaseUrl)).toThrowError(/DATABASE_URL/);
  });

  it("fails startup naming every missing required variable", () => {
    expect(() => loadEnv({})).toThrowError(/DATABASE_URL/);
    expect(() => loadEnv({})).toThrowError(/REDIS_URL/);
    expect(() => loadEnv({})).toThrowError(/S3_BUCKET/);
  });

  it("rejects an invalid APP_URL", () => {
    expect(() => loadEnv({ ...validEnv, APP_URL: "not-a-url" })).toThrowError(/APP_URL/);
  });

  it("throws the production/E2E-mode kill switch", () => {
    expect(() => loadEnv({ ...validEnv, NODE_ENV: "production", E2E_TEST_MODE: "1" })).toThrowError(
      /E2E_TEST_MODE=1 is not allowed when NODE_ENV=production/,
    );
  });

  it("allows E2E_TEST_MODE=1 outside production", () => {
    expect(() => loadEnv({ ...validEnv, NODE_ENV: "test", E2E_TEST_MODE: "1" })).not.toThrow();
  });

  it("allows NODE_ENV=production when E2E_TEST_MODE is unset/0", () => {
    expect(() => loadEnv({ ...validEnv, NODE_ENV: "production" })).not.toThrow();
    expect(() =>
      loadEnv({ ...validEnv, NODE_ENV: "production", E2E_TEST_MODE: "0" }),
    ).not.toThrow();
  });
});
