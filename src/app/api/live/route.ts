import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness: the process is up. No dependency checks (§6 of docs/PLAN.md). */
export function GET(): Response {
  return NextResponse.json({ status: "ok" });
}
