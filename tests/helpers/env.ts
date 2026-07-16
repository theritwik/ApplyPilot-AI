import { resetEnvCacheForTests } from "@/lib/env";

/** A complete, valid environment for tests. No real credentials. */
export const VALID_ENV: Record<string, string> = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  LOG_LEVEL: "error",
  DATABASE_URL: "postgresql://user:pass@localhost:5432/testdb",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "test-bucket",
  S3_ACCESS_KEY_ID: "test-access-key",
  S3_SECRET_ACCESS_KEY: "test-secret-key",
  S3_FORCE_PATH_STYLE: "true",
};

const MANAGED_KEYS = [...Object.keys(VALID_ENV), "E2E_TEST_MODE"];

/**
 * Applies an environment onto process.env (clearing managed keys first) and
 * resets the getEnv() cache so the next call re-parses.
 */
export function applyProcessEnv(overrides: Record<string, string | undefined> = {}): void {
  for (const key of MANAGED_KEYS) {
    delete process.env[key];
  }
  for (const [key, value] of Object.entries({ ...VALID_ENV, ...overrides })) {
    if (value !== undefined) {
      process.env[key] = value;
    }
  }
  resetEnvCacheForTests();
}
