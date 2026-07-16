/**
 * GET /api/live — liveness only (docs/PLAN.md §6).
 * Confirms the web process is running. Deliberately has zero imports and
 * touches no dependencies: if this responds, the process is alive — nothing more.
 */

export const dynamic = "force-dynamic";

export function GET(): Response {
  return Response.json({ status: "live" });
}
