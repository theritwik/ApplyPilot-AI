import pino from "pino";

/**
 * Structured logging (docs/PLAN.md §15, "log hygiene").
 *
 * Two classes of fields are redacted:
 *  1. Secrets/credentials — connection strings, keys, tokens, cookies.
 *  2. Document content — resume/JD text and AI prompt/response fields must
 *     never reach logs. The paths below cover the field names reserved by the
 *     plan's data model and AI layer so protection exists before those
 *     features land (M2+).
 *
 * This module intentionally reads process.env directly (not getEnv()) so that
 * logging works even while environment validation is failing.
 */

const SECRET_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "*.authorization",
  "*.cookie",
  "*.password",
  "*.secret",
  "*.token",
  "*.accessToken",
  "*.refreshToken",
  "*.apiKey",
  "*.accessKeyId",
  "*.secretAccessKey",
  "*.connectionString",
  "DATABASE_URL",
  "REDIS_URL",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
];

const DOCUMENT_CONTENT_PATHS = [
  "rawText",
  "*.rawText",
  "redactedText",
  "*.redactedText",
  "profile",
  "*.profile",
  "requirements",
  "*.requirements",
  "originalText",
  "*.originalText",
  "suggestedText",
  "*.suggestedText",
  "rationale",
  "*.rationale",
  "evidence",
  "*.evidence",
  "prompt",
  "*.prompt",
  "completion",
  "*.completion",
  "email",
  "*.email",
  "phone",
  "*.phone",
];

export const REDACT_PATHS = [...SECRET_PATHS, ...DOCUMENT_CONTENT_PATHS];

function buildLogger(): pino.Logger {
  const level = process.env["LOG_LEVEL"] ?? "info";
  const isDev = (process.env["NODE_ENV"] ?? "development") === "development";

  return pino({
    level,
    redact: { paths: REDACT_PATHS, censor: "[REDACTED]" },
    base: undefined, // omit pid/hostname noise; platforms add their own metadata
    ...(isDev
      ? {
          transport: {
            target: "pino-pretty",
            options: { colorize: true },
          },
        }
      : {}),
  });
}

export const logger: pino.Logger = buildLogger();
