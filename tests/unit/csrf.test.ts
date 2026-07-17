import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { ForbiddenError } from "@/lib/errors";
import { assertCsrfSafe } from "@/server/csrf";

// tests/unit/setup.ts sets APP_URL=http://localhost:3000
const SAME_ORIGIN = "http://localhost:3000";
const CROSS_ORIGIN = "https://evil.example.com";

function makeRequest(
  method: string,
  headers: Record<string, string> = {},
): InstanceType<typeof NextRequest> {
  return new NextRequest("http://localhost:3000/api/example", {
    method,
    headers,
  });
}

describe("assertCsrfSafe", () => {
  it("allows safe methods regardless of origin", () => {
    expect(() => assertCsrfSafe(makeRequest("GET"))).not.toThrow();
    expect(() => assertCsrfSafe(makeRequest("GET", { origin: CROSS_ORIGIN }))).not.toThrow();
  });

  it("allows a state-changing request with a matching Origin header", () => {
    expect(() => assertCsrfSafe(makeRequest("POST", { origin: SAME_ORIGIN }))).not.toThrow();
  });

  it("allows a state-changing request with a matching Referer when Origin is absent", () => {
    expect(() =>
      assertCsrfSafe(makeRequest("POST", { referer: `${SAME_ORIGIN}/some/page` })),
    ).not.toThrow();
  });

  it("rejects a cross-origin POST", () => {
    expect(() => assertCsrfSafe(makeRequest("POST", { origin: CROSS_ORIGIN }))).toThrow(
      ForbiddenError,
    );
  });

  it("rejects a POST with no Origin or Referer", () => {
    expect(() => assertCsrfSafe(makeRequest("POST"))).toThrow(ForbiddenError);
  });

  it("rejects a POST with a malformed Referer", () => {
    expect(() => assertCsrfSafe(makeRequest("POST", { referer: "not-a-url" }))).toThrow(
      ForbiddenError,
    );
  });

  it.each(["PUT", "PATCH", "DELETE"])("also guards %s requests", (method) => {
    expect(() => assertCsrfSafe(makeRequest(method, { origin: CROSS_ORIGIN }))).toThrow(
      ForbiddenError,
    );
    expect(() => assertCsrfSafe(makeRequest(method, { origin: SAME_ORIGIN }))).not.toThrow();
  });
});
