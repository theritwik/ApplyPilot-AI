import { describe, expect, it } from "vitest";

import {
  AppError,
  ConflictError,
  ForbiddenError,
  InternalError,
  NotFoundError,
  RateLimitedError,
  toApiErrorBody,
  toAppError,
  UnauthenticatedError,
  ValidationError,
} from "@/lib/errors";

describe("AppError hierarchy", () => {
  it.each([
    [new ValidationError("bad input"), "VALIDATION_ERROR", 400],
    [new UnauthenticatedError(), "UNAUTHENTICATED", 401],
    [new ForbiddenError(), "FORBIDDEN", 403],
    [new NotFoundError(), "NOT_FOUND", 404],
    [new ConflictError("stale"), "CONFLICT", 409],
    [new RateLimitedError(), "RATE_LIMITED", 429],
    [new InternalError(), "INTERNAL_ERROR", 500],
  ])("%# maps to code/status", (error, code, status) => {
    expect(error).toBeInstanceOf(AppError);
    expect(error.code).toBe(code);
    expect(error.httpStatus).toBe(status);
  });

  it("carries optional details through to the error body", () => {
    const error = new ValidationError("bad input", { field: "email" });
    const body = toApiErrorBody(error);
    expect(body).toEqual({
      error: { code: "VALIDATION_ERROR", message: "bad input", details: { field: "email" } },
    });
  });

  it("omits details when not provided", () => {
    const body = toApiErrorBody(new NotFoundError());
    expect(body.error.details).toBeUndefined();
    expect(Object.keys(body.error)).not.toContain("details");
  });
});

describe("toAppError", () => {
  it("passes AppErrors through unchanged", () => {
    const original = new ConflictError("already applied");
    expect(toAppError(original)).toBe(original);
  });

  it("wraps unknown errors as a generic InternalError without leaking their message", () => {
    const raw = new Error("db password is hunter2");
    const wrapped = toAppError(raw);

    expect(wrapped).toBeInstanceOf(InternalError);
    expect(wrapped.code).toBe("INTERNAL_ERROR");
    expect(wrapped.httpStatus).toBe(500);
    expect(wrapped.message).not.toContain("hunter2");

    const body = toApiErrorBody(wrapped);
    expect(JSON.stringify(body)).not.toContain("hunter2");
  });

  it("wraps non-Error thrown values the same way", () => {
    const wrapped = toAppError("a string was thrown");
    expect(wrapped).toBeInstanceOf(InternalError);
    expect(JSON.stringify(toApiErrorBody(wrapped))).not.toContain("a string was thrown");
  });
});
