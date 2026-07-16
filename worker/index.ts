import { getEnv } from "../src/lib/env";
import { logger } from "../src/lib/logger";

/**
 * Worker entry point — M0 skeleton (docs/PLAN.md §3, §18 M0).
 *
 * Validates the environment, logs startup, and waits for a shutdown signal.
 * It intentionally registers NO queue processors and NO outbox dispatcher —
 * those arrive in M2. Its only job in M0 is to prove the second deployable
 * process boots, validates config, and shuts down gracefully.
 */

async function main(): Promise<void> {
  // Throws EnvValidationError (naming the offending variables) on bad config —
  // including the production E2E_TEST_MODE kill switch.
  const env = getEnv();

  const log = logger.child({ component: "worker" });
  log.info({ nodeEnv: env.NODE_ENV }, "worker started (M0 skeleton — no processors registered)");

  // Signal handlers do not ref the event loop; without this handle the
  // process would exit immediately. M2's queue connections and the outbox
  // dispatcher will hold the loop naturally — then this can go.
  const keepAlive = setInterval(() => {}, 60_000);

  const signal = await new Promise<string>((resolve) => {
    process.once("SIGINT", () => resolve("SIGINT"));
    process.once("SIGTERM", () => resolve("SIGTERM"));
  });

  log.info({ signal }, "shutdown signal received — draining");
  // M2 will stop the outbox dispatcher and close queue connections here.
  clearInterval(keepAlive);
  log.info("worker stopped");
}

main().catch((err: unknown) => {
  // Env validation failures land here: print the readable message and exit non-zero.
  console.error(err instanceof Error ? err.message : String(err));
  console.error("Worker failed to start.");
  process.exit(1);
});
