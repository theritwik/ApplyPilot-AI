import { NextResponse } from "next/server";
import { NotReadyError } from "../../../lib/errors";
import { runReadinessChecks } from "../../../server/health/checks";
import { apiHandler } from "../../../server/http/api";

/**
 * GET /api/ready — readiness (docs/PLAN.md §6).
 * Verifies PostgreSQL, Redis, and object storage independently.
 * 200: { status: "ready", checks: { postgres, redis, objectStorage } }
 * 503: standard error envelope with per-check statuses in details — statuses
 *      only, never raw errors (sanitization requirement, §15).
 */

export const dynamic = "force-dynamic";

export const GET = apiHandler(async () => {
  const checks = await runReadinessChecks();
  const ready = Object.values(checks).every((status) => status === "ok");
  if (!ready) {
    throw new NotReadyError("One or more dependencies are unavailable.", { checks });
  }
  return NextResponse.json({ status: "ready", checks });
});
