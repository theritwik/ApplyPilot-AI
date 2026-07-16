import { CsrfError } from "../lib/errors";
import { getEnv } from "../lib/env";

/**
 * CSRF protection for custom state-changing route handlers (docs/PLAN.md §7).
 *
 * Auth.js protects only its own endpoints. Every custom POST/PATCH/PUT/DELETE
 * handler must call assertTrustedOrigin(request) before doing anything else.
 *
 * Policy: the request must carry an Origin header (falling back to the
 * Referer's origin) whose host matches either the Host the request arrived on
 * or the configured APP_URL origin. Origin-less mutations are rejected.
 * A double-submit CSRF token is the documented escalation path if an embedding
 * scenario ever makes origin checks insufficient.
 */

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

function refererOrigin(referer: string | null): string | null {
  if (!referer) return null;
  try {
    return new URL(referer).origin;
  } catch {
    return null;
  }
}

export function assertTrustedOrigin(request: Request): void {
  if (SAFE_METHODS.has(request.method.toUpperCase())) return;

  const origin = request.headers.get("origin") ?? refererOrigin(request.headers.get("referer"));
  if (!origin) {
    throw new CsrfError("Missing Origin header on a state-changing request.");
  }

  let originUrl: URL;
  try {
    originUrl = new URL(origin);
  } catch {
    throw new CsrfError("Malformed Origin header on a state-changing request.");
  }

  const requestHost =
    request.headers.get("x-forwarded-host") ??
    request.headers.get("host") ??
    new URL(request.url).host;

  const appOrigin = new URL(getEnv().APP_URL).origin;

  const trusted = originUrl.host === requestHost || originUrl.origin === appOrigin;
  if (!trusted) {
    throw new CsrfError("Cross-origin request rejected.");
  }
}
