import type { NextRequest } from "next/server";

import { env } from "@/lib/env";
import { ForbiddenError } from "@/lib/errors";
import { logger } from "@/lib/logger";

const STATE_CHANGING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Auth.js only protects its own endpoints, so every custom state-changing
 * route handler must call this first (docs/PLAN.md §7). Validates the
 * Origin header (falling back to Referer's origin) against an allowlist
 * derived from APP_URL, and throws a ForbiddenError on a mismatch or an
 * origin-less mutation request.
 */
export function assertCsrfSafe(request: NextRequest): void {
  if (!STATE_CHANGING_METHODS.has(request.method)) {
    return;
  }

  const origin = getRequestOrigin(request);
  const allowedOrigins = getAllowedOrigins();

  if (!origin || !allowedOrigins.includes(origin)) {
    logger.warn(
      { method: request.method, path: request.nextUrl.pathname, origin },
      "csrf.rejected",
    );
    throw new ForbiddenError("Cross-origin request rejected");
  }
}

function getAllowedOrigins(): string[] {
  return [new URL(env.APP_URL).origin];
}

function getRequestOrigin(request: NextRequest): string | null {
  const origin = request.headers.get("origin");
  if (origin) {
    return origin;
  }

  const referer = request.headers.get("referer");
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      return null;
    }
  }

  return null;
}
