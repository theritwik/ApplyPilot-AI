import { getEnv } from "@/lib/env";
import { ForbiddenError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * CSRF protection for custom state-changing route handlers (§7 of docs/PLAN.md).
 *
 * Auth.js protects only its own endpoints; every custom POST/PUT/PATCH/DELETE
 * handler calls assertSameOrigin() before doing anything else:
 *
 *  1. The Origin header (falling back to the Referer's origin) must be present
 *     and in the allowlist derived from the configured APP_URL.
 *  2. The origin's host must match the Host header the request arrived on.
 *
 * Cross-origin or origin-less mutations are rejected with 403 and an
 * audit-friendly "csrf.rejected" log line (no request content is logged).
 */

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function assertSameOrigin(request: Request, appUrl?: string): void {
  if (!MUTATING_METHODS.has(request.method.toUpperCase())) {
    return;
  }

  const configuredOrigin = new URL(appUrl ?? getEnv().APP_URL).origin;
  const originHeader =
    request.headers.get("origin") ?? refererOrigin(request.headers.get("referer"));
  const hostHeader = request.headers.get("host");

  const reject = (reason: string): never => {
    logger.warn(
      {
        event: "csrf.rejected",
        reason,
        method: request.method,
        path: new URL(request.url).pathname,
        origin: originHeader,
        host: hostHeader,
      },
      "csrf.rejected",
    );
    throw new ForbiddenError("Cross-origin request rejected", "CSRF_REJECTED");
  };

  if (!originHeader) {
    reject("missing_origin");
  }

  let origin: URL;
  try {
    origin = new URL(originHeader as string);
  } catch {
    return reject("malformed_origin");
  }

  if (origin.origin !== configuredOrigin) {
    reject("origin_not_allowed");
  }

  if (hostHeader !== null && origin.host !== hostHeader) {
    reject("host_mismatch");
  }
}
