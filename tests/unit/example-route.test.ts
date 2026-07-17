import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";

import { POST } from "@/app/api/example/route";

const SAME_ORIGIN = "http://localhost:3000";

function makeRequest(body: unknown, headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost:3000/api/example", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("POST /api/example (M0 scaffold route)", () => {
  it("returns 403 via the AppError envelope on a cross-origin request", async () => {
    const response = await POST(
      makeRequest({ message: "hi" }, { origin: "https://evil.example.com" }),
    );
    const body = (await response.json()) as { error: { code: string; message: string } };

    expect(response.status).toBe(403);
    expect(body.error.code).toBe("FORBIDDEN");
  });

  it("returns 400 via the AppError envelope on invalid input", async () => {
    const response = await POST(makeRequest({ message: "" }, { origin: SAME_ORIGIN }));
    const body = (await response.json()) as { error: { code: string; details?: unknown } };

    expect(response.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(body.error.details).toBeDefined();
  });

  it("returns 200 for a valid, same-origin request", async () => {
    const response = await POST(makeRequest({ message: "hello" }, { origin: SAME_ORIGIN }));
    const body = (await response.json()) as { message: string };

    expect(response.status).toBe(200);
    expect(body.message).toBe("hello");
  });
});
