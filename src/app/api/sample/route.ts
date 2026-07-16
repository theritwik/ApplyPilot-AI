import { NextResponse } from "next/server";
import { z } from "zod";
import { assertTrustedOrigin } from "../../../server/csrf";
import { apiHandler, parseJsonBody } from "../../../server/http/api";

/**
 * POST /api/sample — the M0 API-conventions reference route required by
 * docs/PLAN.md §18 M0 acceptance criteria. It demonstrates, end to end:
 *   - CSRF: cross-origin/origin-less POST → 403 CSRF_REJECTED
 *   - Zod contract validation → 400 VALIDATION_ERROR with issue details
 *   - AppError → envelope mapping via the apiHandler wrapper
 *
 * Not a product feature. Slated for removal when the first real mutation
 * route lands (M2 consent endpoint).
 */

export const dynamic = "force-dynamic";

const sampleRequestSchema = z.object({
  name: z.string().min(1).max(100),
});

export const POST = apiHandler(async (request) => {
  assertTrustedOrigin(request);
  const body = await parseJsonBody(request, sampleRequestSchema);
  return NextResponse.json({ message: `Hello, ${body.name}!` });
});
