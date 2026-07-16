import { describe, expect, it } from "vitest";
import { ForbiddenError } from "@/lib/errors";
import { assertSameOrigin } from "@/server/csrf";

const APP_URL = "http://localhost:3000";

function request(
  method: string,
  headers: Record<string, string> = {},
  url = "http://localhost:3000/api/sample",
): Request {
  return new Request(url, { method, headers });
}

describe("assertSameOrigin", () => {
  it("allows a same-origin POST", () => {
    expect(() =>
      assertSameOrigin(
        request("POST", { origin: "http://localhost:3000", host: "localhost:3000" }),
        APP_URL,
      ),
    ).not.toThrow();
  });

  it("rejects a cross-origin POST with CSRF_REJECTED", () => {
    try {
      assertSameOrigin(
        request("POST", { origin: "https://evil.example", host: "localhost:3000" }),
        APP_URL,
      );
      expect.unreachable("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(ForbiddenError);
      expect((error as ForbiddenError).code).toBe("CSRF_REJECTED");
      expect((error as ForbiddenError).httpStatus).toBe(403);
    }
  });

  it("rejects a mutation with no Origin and no Referer", () => {
    expect(() => assertSameOrigin(request("POST", { host: "localhost:3000" }), APP_URL)).toThrow(
      ForbiddenError,
    );
  });

  it("falls back to the Referer origin when Origin is absent", () => {
    expect(() =>
      assertSameOrigin(
        request("POST", { referer: "http://localhost:3000/resumes", host: "localhost:3000" }),
        APP_URL,
      ),
    ).not.toThrow();

    expect(() =>
      assertSameOrigin(
        request("POST", { referer: "https://evil.example/page", host: "localhost:3000" }),
        APP_URL,
      ),
    ).toThrow(ForbiddenError);
  });

  it("rejects when the Origin host does not match the arrival Host", () => {
    expect(() =>
      assertSameOrigin(
        request("POST", { origin: "http://localhost:3000", host: "spoofed.example" }),
        APP_URL,
      ),
    ).toThrow(ForbiddenError);
  });

  it("rejects a malformed Origin", () => {
    expect(() =>
      assertSameOrigin(request("POST", { origin: "not a url", host: "localhost:3000" }), APP_URL),
    ).toThrow(ForbiddenError);
  });

  it("applies to PUT, PATCH and DELETE", () => {
    for (const method of ["PUT", "PATCH", "DELETE"]) {
      expect(() => assertSameOrigin(request(method, {}), APP_URL)).toThrow(ForbiddenError);
    }
  });

  it("ignores safe methods", () => {
    expect(() => assertSameOrigin(request("GET"), APP_URL)).not.toThrow();
    expect(() => assertSameOrigin(request("HEAD"), APP_URL)).not.toThrow();
  });
});
