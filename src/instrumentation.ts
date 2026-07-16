/**
 * Next.js instrumentation hook: runs once when the server boots, before any
 * request is served. Environment validation happens here so misconfiguration
 * (including the production E2E_TEST_MODE kill switch) fails startup fast.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { getEnv } = await import("@/lib/env");
    const { logger } = await import("@/lib/logger");
    const env = getEnv();
    logger.info({ event: "app.boot", nodeEnv: env.NODE_ENV }, "environment validated");
  }
}
