/**
 * Node.js-runtime startup validation. Kept in a separate module (loaded via a
 * NEXT_RUNTIME-guarded dynamic import in instrumentation.ts) so the Edge
 * bundle never contains process.exit.
 */
import { getEnv } from "./lib/env";

export function validateEnvironmentOrExit(): void {
  try {
    getEnv();
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    console.error("Environment validation failed — refusing to start.");
    process.exit(1);
  }
}
