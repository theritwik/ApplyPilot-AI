import { z } from "zod";

/**
 * Environment validation (docs/PLAN.md §4, §15).
 *
 * Every process (web via instrumentation.ts, worker via worker/index.ts) must
 * call `getEnv()` at startup so a missing or invalid variable fails the boot
 * with a message naming the variable — never a runtime crash later.
 */

const LOG_LEVELS = ["fatal", "error", "warn", "info", "debug", "trace"] as const;

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    /**
     * Enables the test-only authentication provider (M1). Must NEVER be "1"
     * in production — enforced by the kill switch below.
     */
    E2E_TEST_MODE: z.enum(["0", "1"]).optional(),
    /** Public origin of the app; the CSRF Origin allowlist derives from it. */
    APP_URL: z.url({ error: "APP_URL must be a valid URL" }).default("http://localhost:3000"),
    LOG_LEVEL: z.enum(LOG_LEVELS).default("info"),

    DATABASE_URL: z
      .string({ error: "DATABASE_URL is required" })
      .min(1, { error: "DATABASE_URL is required" })
      .refine((v) => v.startsWith("postgresql://") || v.startsWith("postgres://"), {
        error: "DATABASE_URL must be a PostgreSQL connection string (postgresql://...)",
      }),
    REDIS_URL: z
      .string({ error: "REDIS_URL is required" })
      .min(1, { error: "REDIS_URL is required" })
      .refine((v) => v.startsWith("redis://") || v.startsWith("rediss://"), {
        error: "REDIS_URL must be a Redis connection string (redis://...)",
      }),

    S3_ENDPOINT: z.url({ error: "S3_ENDPOINT must be a valid URL" }),
    S3_REGION: z.string().min(1).default("us-east-1"),
    S3_BUCKET: z.string({ error: "S3_BUCKET is required" }).min(1, {
      error: "S3_BUCKET is required",
    }),
    S3_ACCESS_KEY_ID: z.string({ error: "S3_ACCESS_KEY_ID is required" }).min(1, {
      error: "S3_ACCESS_KEY_ID is required",
    }),
    S3_SECRET_ACCESS_KEY: z.string({ error: "S3_SECRET_ACCESS_KEY is required" }).min(1, {
      error: "S3_SECRET_ACCESS_KEY is required",
    }),
    /** Required "true" for MinIO and some S3-compatible providers. */
    S3_FORCE_PATH_STYLE: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .superRefine((cfg, ctx) => {
    // Production safety kill switch (docs/PLAN.md §15): the test-only auth
    // provider must not be enableable in production under any circumstances.
    if (cfg.NODE_ENV === "production" && cfg.E2E_TEST_MODE === "1") {
      ctx.addIssue({
        code: "custom",
        path: ["E2E_TEST_MODE"],
        message: 'E2E_TEST_MODE="1" is forbidden when NODE_ENV="production". Refusing to start.',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

export class EnvValidationError extends Error {
  constructor(issues: ReadonlyArray<{ path: PropertyKey[]; message: string }>) {
    const lines = issues.map((issue) => {
      const name = issue.path.length > 0 ? issue.path.map(String).join(".") : "(environment)";
      return `  - ${name}: ${issue.message}`;
    });
    super(`Invalid environment configuration:\n${lines.join("\n")}`);
    this.name = "EnvValidationError";
  }
}

/** Pure parse — used directly by unit tests. Throws EnvValidationError. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new EnvValidationError(result.error.issues);
  }
  return result.data;
}

let cached: Env | undefined;

/** Cached accessor for the running process's validated environment. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Test-only: clears the cache so tests can re-parse a mutated process.env. */
export function resetEnvCacheForTests(): void {
  cached = undefined;
}
