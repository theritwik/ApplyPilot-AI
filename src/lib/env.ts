import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Enables a test-only auth bypass for Playwright E2E runs (wired up in M1).
  // Must never be "1" in production — enforced below.
  E2E_TEST_MODE: z.enum(["0", "1"]).default("0"),

  // Used to build the CSRF Origin/Host allowlist (src/server/csrf.ts).
  APP_URL: z.string().url("APP_URL must be a valid URL"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),

  S3_ENDPOINT: z.string().min(1, "S3_ENDPOINT is required"),
  S3_REGION: z.string().min(1, "S3_REGION is required"),
  S3_BUCKET: z.string().min(1, "S3_BUCKET is required"),
  S3_ACCESS_KEY_ID: z.string().min(1, "S3_ACCESS_KEY_ID is required"),
  S3_SECRET_ACCESS_KEY: z.string().min(1, "S3_SECRET_ACCESS_KEY is required"),
  S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("false"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Parses and validates process.env, then enforces the production/E2E-mode
 * kill switch. Accepts an explicit source so tests can validate arbitrary
 * env combinations without mutating global process.env.
 */
export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = envSchema.safeParse(source);

  if (!parsed.success) {
    const problems = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid environment configuration - ${problems}`);
  }

  const { data } = parsed;

  if (data.NODE_ENV === "production" && data.E2E_TEST_MODE === "1") {
    throw new Error(
      "Refusing to start: E2E_TEST_MODE=1 is not allowed when NODE_ENV=production. " +
        "The E2E test-only auth provider must never exist in a production build.",
    );
  }

  return data;
}

export const env = loadEnv();
