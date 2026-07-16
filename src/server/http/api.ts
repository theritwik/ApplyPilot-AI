import { NextResponse } from "next/server";
import type { ZodType } from "zod";
import { AppError, ValidationError, errorToEnvelope } from "../../lib/errors";
import { logger } from "../../lib/logger";

/**
 * Route-handler conventions (docs/PLAN.md §4, §6).
 *
 * Handlers are thin: CSRF check → contract validation → service call. This
 * wrapper owns the error boundary so every route returns the standard
 * envelope and unknown errors never leak internals.
 */

type RouteContext = { params: Promise<Record<string, string | string[]>> };
type RouteHandler = (request: Request, context: RouteContext) => Promise<Response> | Response;

export function apiHandler(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (err) {
      const { status, body } = errorToEnvelope(err);
      if (status >= 500 && !(err instanceof AppError)) {
        // Unknown failure: log the real error server-side (redaction applies),
        // return only the generic envelope.
        logger.error(
          { err, method: request.method, path: new URL(request.url).pathname },
          "unhandled API error",
        );
      } else {
        logger.debug(
          {
            code: body.error.code,
            status,
            method: request.method,
            path: new URL(request.url).pathname,
          },
          "request rejected",
        );
      }
      return NextResponse.json(body, { status });
    }
  };
}

/** Parses and validates a JSON request body against a contract schema. */
export async function parseJsonBody<T>(request: Request, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ValidationError("Request body failed validation.", {
      issues: result.error.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    });
  }
  return result.data;
}
