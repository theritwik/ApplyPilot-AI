import { NextResponse } from "next/server";

// Liveness: the process is up. No dependency checks — see /api/ready for
// those. force-dynamic prevents Next from executing/caching this at build
// time.
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({ status: "ok" });
}
