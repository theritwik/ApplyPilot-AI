import { beforeEach, describe, expect, it } from "vitest";
import { GET } from "@/app/api/ready/route";
import { applyProcessEnv } from "../helpers/env";

/**
 * Integration test for GET /api/ready. Requires the docker-compose services:
 *   docker compose up -d   (postgres, redis, minio + applypilot-dev bucket)
 *
 * Connection settings default to the docker-compose values but honor
 * pre-set process.env overrides (e.g. in CI service containers).
 */

const ROUTE_URL = "http://localhost:3000/api/ready";
const routeContext = { params: Promise.resolve({}) };

const composeEnv: Record<string, string> = {
  DATABASE_URL:
    process.env.DATABASE_URL ?? "postgresql://applypilot:applypilot@localhost:5432/applypilot",
  REDIS_URL: process.env.REDIS_URL ?? "redis://localhost:6379",
  S3_ENDPOINT: process.env.S3_ENDPOINT ?? "http://localhost:9000",
  S3_BUCKET: process.env.S3_BUCKET ?? "applypilot-dev",
  S3_ACCESS_KEY_ID: process.env.S3_ACCESS_KEY_ID ?? "minioadmin",
  S3_SECRET_ACCESS_KEY: process.env.S3_SECRET_ACCESS_KEY ?? "minioadmin",
  S3_FORCE_PATH_STYLE: "true",
};

function ready(): Promise<Response> {
  return Promise.resolve(GET(new Request(ROUTE_URL), routeContext));
}

describe("GET /api/ready (integration)", () => {
  beforeEach(() => {
    applyProcessEnv(composeEnv);
  });

  it("returns 200 with every check ok when all dependencies are reachable", async () => {
    const response = await ready();
    const body = await response.json();
    expect(body).toEqual({
      status: "ready",
      checks: { postgres: "ok", redis: "ok", objectStorage: "ok" },
    });
    expect(response.status).toBe(200);
  });

  it("returns 503 flagging only redis when redis is unreachable", async () => {
    applyProcessEnv({ ...composeEnv, REDIS_URL: "redis://localhost:6390" });
    const response = await ready();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.code).toBe("NOT_READY");
    expect(body.error.details.checks).toEqual({
      postgres: "ok",
      redis: "error",
      objectStorage: "ok",
    });
    // Sanitization: no connection strings or stack traces in the response.
    const raw = JSON.stringify(body);
    expect(raw).not.toContain("redis://");
    expect(raw).not.toContain("ECONNREFUSED");
    expect(raw).not.toContain("at ");
  });

  it("returns 503 flagging only object storage when the bucket is wrong", async () => {
    applyProcessEnv({ ...composeEnv, S3_BUCKET: "does-not-exist-bucket" });
    const response = await ready();
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error.details.checks.objectStorage).toBe("error");
    expect(body.error.details.checks.redis).toBe("ok");
    expect(body.error.details.checks.postgres).toBe("ok");
  });
});
