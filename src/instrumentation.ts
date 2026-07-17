/**
 * Next.js server-startup hook: forces environment validation at boot so a
 * missing/invalid variable (or the production E2E_TEST_MODE kill switch)
 * fails startup with a clear message instead of a 500 on the first request.
 * src/lib/env.ts validates eagerly at import time — importing it here is the
 * whole job.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  try {
    await import("./lib/env");
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error("Environment validation failed — refusing to start.");
    process.exit(1);
  }
}
