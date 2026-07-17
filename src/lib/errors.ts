/**
 * AppError taxonomy and the standard API error envelope:
 * { error: { code, message, details? } }
 */

export type ErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

interface AppErrorOptions {
  code: ErrorCode;
  message: string;
  httpStatus: number;
  details?: unknown;
  cause?: unknown;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly httpStatus: number;
  readonly details?: unknown;

  constructor({ code, message, httpStatus, details, cause }: AppErrorOptions) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = "AppError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.details = details;
  }
}

export class ValidationError extends AppError {
  constructor(message = "Invalid request", details?: unknown) {
    super({ code: "VALIDATION_ERROR", message, httpStatus: 400, details });
    this.name = "ValidationError";
  }
}

export class UnauthenticatedError extends AppError {
  constructor(message = "Authentication required") {
    super({ code: "UNAUTHENTICATED", message, httpStatus: 401 });
    this.name = "UnauthenticatedError";
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super({ code: "FORBIDDEN", message, httpStatus: 403 });
    this.name = "ForbiddenError";
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super({ code: "NOT_FOUND", message, httpStatus: 404 });
    this.name = "NotFoundError";
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict", details?: unknown) {
    super({ code: "CONFLICT", message, httpStatus: 409, details });
    this.name = "ConflictError";
  }
}

export class RateLimitedError extends AppError {
  constructor(message = "Too many requests") {
    super({ code: "RATE_LIMITED", message, httpStatus: 429 });
    this.name = "RateLimitedError";
  }
}

export class InternalError extends AppError {
  constructor(message = "Internal server error", cause?: unknown) {
    super({ code: "INTERNAL_ERROR", message, httpStatus: 500, cause });
    this.name = "InternalError";
  }
}

export interface ApiErrorBody {
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
  };
}

export function toApiErrorBody(error: AppError): ApiErrorBody {
  const body: ApiErrorBody = {
    error: { code: error.code, message: error.message },
  };
  if (error.details !== undefined) {
    body.error.details = error.details;
  }
  return body;
}

/**
 * Normalizes any thrown value into an AppError. Unknown errors are mapped to
 * a generic InternalError so their (possibly sensitive) message is never
 * sent to the client — callers should log the original `error` themselves
 * before/while calling this.
 */
export function toAppError(error: unknown): AppError {
  if (error instanceof AppError) {
    return error;
  }
  return new InternalError("Internal server error", error);
}
