import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AppError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  RateLimitError,
  UnauthorizedError,
  ValidationError,
  toErrorEnvelope,
} from "@/lib/errors";

describe("AppError taxonomy", () => {
  it.each([
    [new ValidationError(), 400, "VALIDATION_ERROR"],
    [new UnauthorizedError(), 401, "UNAUTHORIZED"],
    [new ForbiddenError(), 403, "FORBIDDEN"],
    [new NotFoundError(), 404, "NOT_FOUND"],
    [new ConflictError(), 409, "CONFLICT"],
    [new RateLimitError(), 429, "RATE_LIMITED"],
  ] as const)("%s maps to its status and code", (error, status, code) => {
    const envelope = toErrorEnvelope(error);
    expect(envelope.status).toBe(status);
    expect(envelope.body.error.code).toBe(code);
    expect(envelope.body.error.message).toBe(error.message);
  });

  it("supports a custom code on ForbiddenError (CSRF)", () => {
    const envelope = toErrorEnvelope(new ForbiddenError("Cross-origin", "CSRF_REJECTED"));
    expect(envelope.status).toBe(403);
    expect(envelope.body.error.code).toBe("CSRF_REJECTED");
  });

  it("includes details when present and omits the key when absent", () => {
    const withDetails = toErrorEnvelope(new ValidationError("bad", { field: "title" }));
    expect(withDetails.body.error.details).toEqual({ field: "title" });
    const withoutDetails = toErrorEnvelope(new NotFoundError());
    expect("details" in withoutDetails.body.error).toBe(false);
  });

  it("is an Error and an AppError", () => {
    const error = new NotFoundError();
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(AppError);
    expect(error.name).toBe("NotFoundError");
  });
});

describe("toErrorEnvelope", () => {
  it("maps ZodError to a 400 with per-field issues", () => {
    const schema = z.object({ message: z.string().min(1) });
    const result = schema.safeParse({ message: 42 });
    expect(result.success).toBe(false);
    if (result.success) return;

    const envelope = toErrorEnvelope(result.error);
    expect(envelope.status).toBe(400);
    expect(envelope.body.error.code).toBe("VALIDATION_ERROR");
    expect(envelope.body.error.details).toEqual([expect.objectContaining({ path: "message" })]);
  });

  it("maps unknown errors to a generic 500 without leaking the message", () => {
    const envelope = toErrorEnvelope(new Error("secret internal detail"));
    expect(envelope.status).toBe(500);
    expect(envelope.body.error.code).toBe("INTERNAL_ERROR");
    expect(JSON.stringify(envelope.body)).not.toContain("secret internal detail");
  });

  it("maps non-Error throws to a generic 500", () => {
    const envelope = toErrorEnvelope("boom");
    expect(envelope.status).toBe(500);
    expect(envelope.body.error.code).toBe("INTERNAL_ERROR");
  });
});
