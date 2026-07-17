import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

/**
 * Integration tests hit real dependencies. Start them first:
 *   docker compose up -d        (postgres, redis, minio + applypilot-dev bucket)
 *   npm run test:integration
 * Connection settings default to the docker-compose values; pre-set env vars
 * (e.g. CI service containers) take precedence — see tests/integration/setup.ts.
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    setupFiles: ["tests/integration/setup.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Tests mutate process.env and reset module singletons; keep them serial.
    fileParallelism: false,
  },
});
