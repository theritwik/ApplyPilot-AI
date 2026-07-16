import { z } from "zod";

/**
 * Zod-validated process.env (§4, §15 of docs/PLAN.md).
 *
 * Every variable crossing the process boundary is validated here; the app
 * fails fast at boot (src/instrumentation.ts, worker/index.ts) on missing or
 * malformed configuration, naming the offending variable(s).
 */

const flag = z.enum(["0", "1"]);

export const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Public URL the app is served from; the CSRF Origin allowlist derives from it.
  APP_URL: z.string().url(),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  S3_ENDPOINT: z.string().url(),
  S3_REGION: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: flag.default("0"),

  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  // Enables the test-only credentials provider (M1). Must never be on in
  // production — see the kill switch below.
  E2E_TEST_MODE: flag.optional(),
});

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EnvValidationError";
  }
}

/**
 * Validates an environment source. Throws EnvValidationError naming every
 * missing or invalid variable, and enforces the production E2E kill switch:
 * startup MUST fail when NODE_ENV === "production" and E2E_TEST_MODE === "1".
 */
export function validateEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const problems = parsed.error.issues.map(
      (issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`,
    );
    throw new EnvValidationError(`Invalid environment configuration:\n${problems.join("\n")}`);
  }

  const env = parsed.data;

  if (env.NODE_ENV === "production" && env.E2E_TEST_MODE === "1") {
    throw new EnvValidationError(
      "E2E_TEST_MODE=1 is forbidden in production: the test-only auth provider " +
        "must never exist in a production deployment. Unset E2E_TEST_MODE.",
    );
  }

  return env;
}

let cached: Env | undefined;

/** Validated environment, cached after the first successful validation. */
export function getEnv(): Env {
  if (cached === undefined) {
    cached = validateEnv();
  }
  return cached;
}

/** Test-only: clears the cached environment so getEnv() re-validates. */
export function resetEnvCache(): void {
  cached = undefined;
}
