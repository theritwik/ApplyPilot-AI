import { NextResponse } from "next/server";
import { apiHandler } from "@/lib/api-handler";
import { getReadiness } from "@/server/health";

export const dynamic = "force-dynamic";

/**
 * Readiness: PostgreSQL, applied migrations, Redis, and object storage are
 * reported individually; 503 when any check fails (§6 of docs/PLAN.md).
 */
export const GET = apiHandler(async () => {
  const readiness = await getReadiness();
  return NextResponse.json(
    { status: readiness.ok ? "ready" : "unavailable", checks: readiness.checks },
    { status: readiness.ok ? 200 : 503 },
  );
});
