import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/sample/route";
import { applyProcessEnv } from "../helpers/env";

const ROUTE_URL = "http://localhost:3000/api/sample";
const routeContext = { params: Promise.resolve({}) };

function post(body: unknown, headers: Record<string, string> = {}): Promise<Response> {
  return Promise.resolve(
    POST(
      new Request(ROUTE_URL, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
      routeContext,
    ),
  );
}

describe("POST /api/sample (M0 API-conventions reference route)", () => {
  beforeEach(() => {
    applyProcessEnv();
  });

  it("rejects a cross-origin request with 403 CSRF_REJECTED", async () => {
    const response = await post({ name: "Ada" }, { origin: "https://evil.example" });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("CSRF_REJECTED");
    expect(body.error.message).toBeTypeOf("string");
  });

  it("rejects an origin-less state-changing request with 403", async () => {
    const response = await post({ name: "Ada" });
    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.error.code).toBe("CSRF_REJECTED");
  });

  it("rejects an invalid body with 400 VALIDATION_ERROR and issue details", async () => {
    const response = await post({}, { origin: "http://localhost:3000" });
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details.issues.some((i: { path: string }) => i.path === "name")).toBe(true);
  });

  it("rejects malformed JSON with 400 VALIDATION_ERROR", async () => {
    const response = await POST(
      new Request(ROUTE_URL, {
        method: "POST",
        headers: { "content-type": "application/json", origin: "http://localhost:3000" },
        body: "not-json",
      }),
      routeContext,
    );
    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });

  it("accepts a same-origin valid request", async () => {
    const response = await post({ name: "Ada" }, { origin: "http://localhost:3000" });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ message: "Hello, Ada!" });
  });

  it("accepts a request whose Origin matches the configured APP_URL", async () => {
    applyProcessEnv({ APP_URL: "https://app.applypilot.example" });
    const response = await post({ name: "Ada" }, { origin: "https://app.applypilot.example" });
    expect(response.status).toBe(200);
  });
});
