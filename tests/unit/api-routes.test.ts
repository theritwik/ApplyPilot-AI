import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resetEnvCache } from "@/lib/env";
import { GET as getLive } from "@/app/api/live/route";
import { POST as postSample } from "@/app/api/sample/route";

const routeContext = { params: Promise.resolve({}) };

const testEnv = {
  NODE_ENV: "test",
  APP_URL: "http://localhost:3000",
  DATABASE_URL: "postgresql://applypilot:applypilot@localhost:5432/applypilot",
  REDIS_URL: "redis://localhost:6379",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "applypilot-dev",
  S3_ACCESS_KEY_ID: "minioadmin",
  S3_SECRET_ACCESS_KEY: "minioadmin",
  S3_FORCE_PATH_STYLE: "1",
} as const;

const previous: Record<string, string | undefined> = {};

beforeAll(() => {
  for (const [key, value] of Object.entries(testEnv)) {
    previous[key] = process.env[key];
    process.env[key] = value;
  }
  resetEnvCache();
});

afterAll(() => {
  for (const [key, value] of Object.entries(previous)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  resetEnvCache();
});

function sampleRequest(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request("http://localhost:3000/api/sample", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://localhost:3000",
      host: "localhost:3000",
      ...headers,
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

describe("GET /api/live", () => {
  it("returns 200 with no dependency checks", async () => {
    const response = getLive();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok" });
  });
});

describe("POST /api/sample", () => {
  it("echoes valid input", async () => {
    const response = await postSample(sampleRequest({ message: "hello" }), routeContext);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ echo: "hello" });
  });

  it("returns a 400 envelope with issue details on bad input (Zod)", async () => {
    const response = await postSample(sampleRequest({ message: "" }), routeContext);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toEqual([expect.objectContaining({ path: "message" })]);
  });

  it("returns a 400 envelope on malformed JSON", async () => {
    const response = await postSample(sampleRequest("{not json"), routeContext);
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.message).toMatch(/JSON/);
  });

  it("maps AppError subclasses through the envelope (404)", async () => {
    const response = await postSample(sampleRequest({ message: "missing" }), routeContext);
    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.error).toEqual({ code: "NOT_FOUND", message: "No such sample" });
  });

  it("rejects a cross-origin POST with 403 (CSRF check active)", async () => {
    const response = await postSample(
      sampleRequest({ message: "hello" }, { origin: "https://evil.example" }),
      routeContext,
    );
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("CSRF_REJECTED");
  });

  it("rejects an origin-less POST with 403", async () => {
    const request = new Request("http://localhost:3000/api/sample", {
      method: "POST",
      headers: { "content-type": "application/json", host: "localhost:3000" },
      body: JSON.stringify({ message: "hello" }),
    });
    const response = await postSample(request, routeContext);
    expect(response.status).toBe(403);
  });
});
