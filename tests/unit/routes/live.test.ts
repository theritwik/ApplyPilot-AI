import { describe, expect, it } from "vitest";

import { GET } from "@/app/api/live/route";

describe("GET /api/live", () => {
  it("returns 200 with no dependency checks", async () => {
    const response = GET();
    expect(response.status).toBe(200);
    const body = (await response.json()) as { status: string };
    expect(body).toEqual({ status: "ok" });
  });
});
