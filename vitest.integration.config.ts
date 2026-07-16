import path from "node:path";
import { defineConfig } from "vitest/config";

// Integration tests expect the docker-compose services (postgres, redis, minio)
// to be running and the environment configured as in .env.example.
export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    environment: "node",
    include: ["tests/integration/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
