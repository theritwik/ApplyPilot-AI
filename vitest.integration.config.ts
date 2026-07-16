import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Integration tests expect the docker-compose services (postgres, redis,
 * minio + bucket) to be running: `docker compose up -d`.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // Dependency checks mutate process.env + module singletons; keep serial.
    fileParallelism: false,
    clearMocks: true,
  },
});
