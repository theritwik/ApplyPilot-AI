import pino, { type LoggerOptions } from "pino";

import { env } from "@/lib/env";

/**
 * Paths redacted from every log line. Resume/JD text, prompts, AI responses
 * and PII must never reach logs (docs/PLAN.md §15) — this list covers common
 * secret/credential fields plus the document-text fields later milestones
 * introduce, at both root and one-level-nested positions.
 */
export const REDACTED_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "password",
  "*.password",
  "token",
  "*.token",
  "accessToken",
  "*.accessToken",
  "refreshToken",
  "*.refreshToken",
  "secret",
  "*.secret",
  "apiKey",
  "*.apiKey",
  "email",
  "*.email",
  "phone",
  "*.phone",
  "rawText",
  "*.rawText",
  "resumeText",
  "*.resumeText",
  "suggestedText",
  "*.suggestedText",
  "originalText",
  "*.originalText",
];

const baseOptions: LoggerOptions = {
  level: env.LOG_LEVEL,
  redact: {
    paths: REDACTED_PATHS,
    censor: "[REDACTED]",
  },
};

/**
 * Creates a pino logger. Pass an explicit destination stream in tests to
 * capture output (with an explicit `level`, since LOG_LEVEL is normally
 * "silent" in the test environment); production/dev callers should use the
 * `logger` singleton below.
 */
export function createLogger(
  destination?: pino.DestinationStream,
  level: LoggerOptions["level"] = env.LOG_LEVEL,
): pino.Logger {
  const usePrettyTransport = env.NODE_ENV === "development" && !destination;

  const options: LoggerOptions = usePrettyTransport
    ? {
        ...baseOptions,
        level,
        transport: {
          target: "pino-pretty",
          options: { colorize: true, translateTime: "SYS:standard" },
        },
      }
    : { ...baseOptions, level };

  return destination ? pino(options, destination) : pino(options);
}

export const logger = createLogger();
