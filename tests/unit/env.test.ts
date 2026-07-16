import { describe, expect, it } from "vitest";
import { EnvValidationError, validateEnv } from "@/lib/env";

const validEnv: NodeJS.ProcessEnv = {
  NODE_ENV: "development",
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

describe("validateEnv", () => {
  it("accepts a complete valid environment", () => {
    const env = validateEnv(validEnv);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.LOG_LEVEL).toBe("info");
  });

  it("fails naming the missing variable", () => {
    const { DATABASE_URL: _omitted, ...withoutDb } = validEnv;
    expect(() => validateEnv(withoutDb)).toThrowError(/DATABASE_URL/);
    expect(() => validateEnv(withoutDb)).toThrowError(EnvValidationError);
  });

  it("names every missing variable at once", () => {
    const { REDIS_URL: _r, S3_BUCKET: _b, ...rest } = validEnv;
    const attempt = () => validateEnv(rest);
    expect(attempt).toThrowError(/REDIS_URL/);
    expect(attempt).toThrowError(/S3_BUCKET/);
  });

  it("rejects malformed URLs", () => {
    expect(() => validateEnv({ ...validEnv, APP_URL: "not-a-url" })).toThrowError(/APP_URL/);
  });

  describe("production E2E kill switch", () => {
    it("fails startup when NODE_ENV=production and E2E_TEST_MODE=1", () => {
      expect(() =>
        validateEnv({ ...validEnv, NODE_ENV: "production", E2E_TEST_MODE: "1" }),
      ).toThrowError(/E2E_TEST_MODE/);
    });

    it("allows production without E2E_TEST_MODE", () => {
      expect(() => validateEnv({ ...validEnv, NODE_ENV: "production" })).not.toThrow();
    });

    it("allows production with E2E_TEST_MODE=0", () => {
      expect(() =>
        validateEnv({ ...validEnv, NODE_ENV: "production", E2E_TEST_MODE: "0" }),
      ).not.toThrow();
    });

    it("allows E2E_TEST_MODE=1 outside production", () => {
      expect(() =>
        validateEnv({ ...validEnv, NODE_ENV: "test", E2E_TEST_MODE: "1" }),
      ).not.toThrow();
    });
  });
});
