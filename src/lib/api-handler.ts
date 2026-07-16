import { NextResponse } from "next/server";
import { AppError, toErrorEnvelope } from "@/lib/errors";
import { logger } from "@/lib/logger";

type RouteContext = { params: Promise<Record<string, string | string[]>> };
type RouteHandler = (request: Request, context: RouteContext) => Promise<Response> | Response;

/**
 * Wraps a route handler so every thrown error is mapped to the standard
 * envelope { error: { code, message, details? } }. Expected errors (AppError,
 * ZodError) log at warn; anything unexpected logs at error and returns a
 * generic 500 — internal details never reach the client.
 */
export function apiHandler(handler: RouteHandler): RouteHandler {
  return async (request, context) => {
    try {
      return await handler(request, context);
    } catch (error) {
      const { status, body } = toErrorEnvelope(error);
      const logContext = {
        event: "api.error",
        method: request.method,
        path: new URL(request.url).pathname,
        status,
        code: body.error.code,
      };
      if (status >= 500) {
        logger.error({ ...logContext, err: error }, "api.error");
      } else if (!(error instanceof AppError && error.code === "CSRF_REJECTED")) {
        // CSRF rejections already logged a dedicated csrf.rejected line.
        logger.warn(logContext, "api.error");
      }
      return NextResponse.json(body, { status });
    }
  };
}
