import { NextResponse } from "next/server";
import { z } from "zod";
import { apiHandler } from "@/lib/api-handler";
import { NotFoundError, ValidationError } from "@/lib/errors";
import { assertSameOrigin } from "@/server/csrf";

export const dynamic = "force-dynamic";

/**
 * M0 sample route (acceptance criterion §18): demonstrates the standard
 * request pipeline — CSRF Origin check (403), Zod contract validation (400
 * with issue details), AppError mapping (404 via the "missing" message), and
 * the { error: { code, message, details? } } envelope on every failure.
 */

const sampleRequestSchema = z.object({
  message: z.string().min(1).max(200),
});

export const POST = apiHandler(async (request) => {
  assertSameOrigin(request);

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON");
  }

  const input = sampleRequestSchema.parse(raw);

  if (input.message === "missing") {
    throw new NotFoundError("No such sample");
  }

  return NextResponse.json({ echo: input.message });
});
