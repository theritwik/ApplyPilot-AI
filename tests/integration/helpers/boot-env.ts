// Spawned by kill-switch.test.ts: boots environment validation exactly the way
// the app does at startup, in a fresh process, and exits non-zero on failure.
import { validateEnv } from "../../../src/lib/env";

try {
  validateEnv(process.env);
  console.log("ENV_OK");
  process.exit(0);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
