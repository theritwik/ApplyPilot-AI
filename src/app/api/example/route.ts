import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { toApiErrorBody, toAppError, ValidationError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { assertCsrfSafe } from "@/server/csrf";

/**
 * Scaffold-only route (not a product feature) proving the M0 infrastructure
 * wires together end to end: CSRF check → Zod validation → AppError → the
 * standard API error envelope. See docs/PLAN.md M0 acceptance criteria.
 */
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  message: z.string().min(1).max(500),
});

export async function POST(request: NextRequest) {
  try {
    assertCsrfSafe(request);

    const json: unknown = await request.json().catch(() => null);
    const parsed = bodySchema.safeParse(json);
    if (!parsed.success) {
      throw new ValidationError("Invalid request body", parsed.error.flatten());
    }

    return NextResponse.json({ message: parsed.data.message });
  } catch (error) {
    const appError = toAppError(error);
    if (appError.httpStatus >= 500) {
      logger.error({ err: error }, "unhandled error in POST /api/example");
    }
    return NextResponse.json(toApiErrorBody(appError), { status: appError.httpStatus });
  }
}
