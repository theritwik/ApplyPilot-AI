import { describe, expect, it } from "vitest";
import { GET } from "@/app/api/live/route";

describe("GET /api/live", () => {
  it("returns 200 with a live status and touches no dependencies", async () => {
    // No environment is applied for this test on purpose: liveness must work
    // even when configuration or dependencies are broken.
    const response = GET();
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "live" });
  });
});
