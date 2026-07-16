import { ZodError } from "zod";

/**
 * Application error taxonomy (docs/PLAN.md §4).
 *
 * Every error that crosses the API boundary is mapped to the standard envelope:
 *
 *   { "error": { "code": "STRING_CODE", "message": "safe message", "details": optional } }
 *
 * AppError messages and details are considered safe for users by construction —
 * services must never put credentials, internal identifiers of other users, or
 * document content into them. Unknown errors are never exposed: they map to a
 * generic 500 INTERNAL_ERROR.
 */

export class AppError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(code: string, message: string, status: number, details?: unknown) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Request failed validation.", details?: unknown) {
    super("VALIDATION_ERROR", message, 400, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Authentication required.") {
    super("UNAUTHORIZED", message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this resource.") {
    super("FORBIDDEN", message, 403);
  }
}

/** Cross-origin / missing-origin state-changing request (docs/PLAN.md §7). */
export class CsrfError extends AppError {
  constructor(message = "Cross-origin request rejected.") {
    super("CSRF_REJECTED", message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Resource not found.") {
    super("NOT_FOUND", message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "The request conflicts with the current state.", details?: unknown) {
    super("CONFLICT", message, 409, details);
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests. Try again later.") {
    super("RATE_LIMITED", message, 429);
  }
}

/** Readiness / dependency failures. Details carry per-check statuses only. */
export class NotReadyError extends AppError {
  constructor(message = "One or more dependencies are unavailable.", details?: unknown) {
    super("NOT_READY", message, 503, details);
  }
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ErrorEnvelope {
  status: number;
  body: ApiErrorBody;
}

function envelope(code: string, message: string, status: number, details?: unknown): ErrorEnvelope {
  return {
    status,
    body: { error: { code, message, ...(details !== undefined ? { details } : {}) } },
  };
}

/**
 * Maps any thrown value to the standard envelope. Pure — no logging here;
 * callers (the apiHandler wrapper) log before responding.
 */
export function errorToEnvelope(err: unknown): ErrorEnvelope {
  if (err instanceof AppError) {
    return envelope(err.code, err.message, err.status, err.details);
  }
  if (err instanceof ZodError) {
    return envelope("VALIDATION_ERROR", "Request failed validation.", 400, {
      issues: err.issues.map((issue) => ({
        path: issue.path.map(String).join("."),
        message: issue.message,
      })),
    });
  }
  // Unknown error: never leak internal messages or stack traces.
  return envelope("INTERNAL_ERROR", "An unexpected error occurred.", 500);
}
