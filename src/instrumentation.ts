/**
 * Next.js server-startup hook. Validates the environment before the server
 * takes traffic so a missing/invalid variable fails the boot with a clear
 * message naming the variable (docs/PLAN.md §4, §18 M0), including the
 * production E2E_TEST_MODE kill switch.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  // Never run during `next build` — builds must not require runtime env.
  if (process.env.NEXT_PHASE === "phase-production-build") return;

  const { validateEnvironmentOrExit } = await import("./instrumentation.node");
  validateEnvironmentOrExit();
}
