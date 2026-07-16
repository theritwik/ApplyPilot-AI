import pino from "pino";

/**
 * Structured pino logger with log hygiene (§15 of docs/PLAN.md).
 *
 * Resume/JD text, AI prompts/responses, and credentials must never reach the
 * log stream. Every logged object is passed through a recursive scrubber that
 * replaces sensitive fields with "[REDACTED]" — a denylist of document-text
 * and secret-bearing key names, matched case-insensitively.
 */

const SENSITIVE_KEYS = new Set([
  // Document text (resumes, job descriptions, AI inputs/outputs)
  "rawtext",
  "text",
  "documenttext",
  "redactedtext",
  "profile",
  "requirements",
  "prompt",
  "completion",
  "response",
  "suggestedtext",
  "originaltext",
  "rationale",
  "evidence",
  // Contact PII
  "email",
  "phone",
  "address",
  // Credentials and secrets
  "password",
  "secret",
  "token",
  "accesstoken",
  "refreshtoken",
  "apikey",
  "authorization",
  "cookie",
  "sessiontoken",
]);

const REDACTED = "[REDACTED]";
const MAX_DEPTH = 8;

function scrubValue(value: unknown, depth: number): unknown {
  if (depth > MAX_DEPTH || value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => scrubValue(item, depth + 1));
  }
  if (value instanceof Error) {
    return value;
  }
  const scrubbed: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    scrubbed[key] = SENSITIVE_KEYS.has(key.toLowerCase().replace(/[_-]/g, ""))
      ? REDACTED
      : scrubValue(entry, depth + 1);
  }
  return scrubbed;
}

/** Recursively replaces sensitive fields with "[REDACTED]". Exported for tests. */
export function scrub(object: Record<string, unknown>): Record<string, unknown> {
  return scrubValue(object, 0) as Record<string, unknown>;
}

export interface BuildLoggerOptions {
  level?: string;
  base?: Record<string, unknown>;
}

/** Logger factory; tests pass an in-memory destination stream. */
export function buildLogger(
  options: BuildLoggerOptions = {},
  destination?: pino.DestinationStream,
): pino.Logger {
  const instance = pino(
    {
      level: options.level ?? process.env.LOG_LEVEL ?? "info",
      base: options.base ?? { app: "applypilot" },
      formatters: {
        log: scrub,
      },
    },
    destination ?? pino.destination(1),
  );
  return instance;
}

export const logger = buildLogger();
