import { describe, expect, it } from "vitest";
import { EnvValidationError, parseEnv } from "@/lib/env";
import { VALID_ENV } from "../helpers/env";

describe("parseEnv", () => {
  it("accepts a complete valid environment and applies transforms/defaults", () => {
    const env = parseEnv(VALID_ENV);
    expect(env.NODE_ENV).toBe("test");
    expect(env.S3_FORCE_PATH_STYLE).toBe(true);
    expect(env.S3_REGION).toBe("us-east-1");
  });

  it("applies defaults for optional variables", () => {
    const rest = { ...VALID_ENV };
    delete rest["APP_URL"];
    delete rest["LOG_LEVEL"];
    delete rest["S3_FORCE_PATH_STYLE"];
    const env = parseEnv(rest);
    expect(env.APP_URL).toBe("http://localhost:3000");
    expect(env.LOG_LEVEL).toBe("info");
    expect(env.S3_FORCE_PATH_STYLE).toBe(false);
  });

  it.each(["DATABASE_URL", "REDIS_URL", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY"])(
    "fails with an error naming the variable when %s is missing",
    (key) => {
      const source = { ...VALID_ENV };
      delete source[key];
      expect(() => parseEnv(source)).toThrowError(EnvValidationError);
      expect(() => parseEnv(source)).toThrowError(new RegExp(key));
    },
  );

  it("rejects a DATABASE_URL that is not a PostgreSQL connection string", () => {
    expect(() => parseEnv({ ...VALID_ENV, DATABASE_URL: "mysql://x" })).toThrowError(
      /DATABASE_URL/,
    );
  });

  it("rejects a REDIS_URL that is not a Redis connection string", () => {
    expect(() => parseEnv({ ...VALID_ENV, REDIS_URL: "http://localhost:6379" })).toThrowError(
      /REDIS_URL/,
    );
  });

  it("rejects an invalid LOG_LEVEL", () => {
    expect(() => parseEnv({ ...VALID_ENV, LOG_LEVEL: "verbose" })).toThrowError(/LOG_LEVEL/);
  });

  describe("production E2E_TEST_MODE kill switch", () => {
    it('refuses to start when NODE_ENV="production" and E2E_TEST_MODE="1"', () => {
      const source = { ...VALID_ENV, NODE_ENV: "production", E2E_TEST_MODE: "1" };
      expect(() => parseEnv(source)).toThrowError(EnvValidationError);
      expect(() => parseEnv(source)).toThrowError(/E2E_TEST_MODE/);
      expect(() => parseEnv(source)).toThrowError(/production/);
    });

    it("allows production without E2E_TEST_MODE", () => {
      expect(() => parseEnv({ ...VALID_ENV, NODE_ENV: "production" })).not.toThrow();
    });

    it('allows E2E_TEST_MODE="1" outside production', () => {
      expect(() =>
        parseEnv({ ...VALID_ENV, NODE_ENV: "development", E2E_TEST_MODE: "1" }),
      ).not.toThrow();
      expect(() => parseEnv({ ...VALID_ENV, NODE_ENV: "test", E2E_TEST_MODE: "1" })).not.toThrow();
    });

    it('allows E2E_TEST_MODE="0" in production', () => {
      expect(() =>
        parseEnv({ ...VALID_ENV, NODE_ENV: "production", E2E_TEST_MODE: "0" }),
      ).not.toThrow();
    });
  });
});
