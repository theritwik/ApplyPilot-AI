import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  AppError,
  ConflictError,
  CsrfError,
  errorToEnvelope,
  ForbiddenError,
  NotFoundError,
  NotReadyError,
  RateLimitedError,
  UnauthorizedError,
  ValidationError,
} from "@/lib/errors";

describe("errorToEnvelope", () => {
  it.each([
    [new ValidationError(), 400, "VALIDATION_ERROR"],
    [new UnauthorizedError(), 401, "UNAUTHORIZED"],
    [new ForbiddenError(), 403, "FORBIDDEN"],
    [new CsrfError(), 403, "CSRF_REJECTED"],
    [new NotFoundError(), 404, "NOT_FOUND"],
    [new ConflictError(), 409, "CONFLICT"],
    [new RateLimitedError(), 429, "RATE_LIMITED"],
    [new NotReadyError(), 503, "NOT_READY"],
  ])("maps %s to status %i with code %s", (err, status, code) => {
    const envelope = errorToEnvelope(err);
    expect(envelope.status).toBe(status);
    expect(envelope.body.error.code).toBe(code);
    expect(envelope.body.error.message).toBe((err as AppError).message);
  });

  it("includes details when the AppError carries them", () => {
    const envelope = errorToEnvelope(new NotReadyError("nope", { checks: { redis: "error" } }));
    expect(envelope.body.error.details).toEqual({ checks: { redis: "error" } });
  });

  it("omits the details key when there are none", () => {
    const envelope = errorToEnvelope(new NotFoundError());
    expect("details" in envelope.body.error).toBe(false);
  });

  it("maps ZodError to 400 VALIDATION_ERROR with sanitized issue details", () => {
    const result = z.object({ name: z.string().min(1) }).safeParse({});
    expect(result.success).toBe(false);
    if (result.success) return;
    const envelope = errorToEnvelope(result.error);
    expect(envelope.status).toBe(400);
    expect(envelope.body.error.code).toBe("VALIDATION_ERROR");
    const details = envelope.body.error.details as { issues: Array<{ path: string }> };
    expect(details.issues.some((issue) => issue.path === "name")).toBe(true);
  });

  it("maps unknown errors to a generic 500 without leaking the message", () => {
    const envelope = errorToEnvelope(new Error("secret: postgresql://user:pass@host/db"));
    expect(envelope.status).toBe(500);
    expect(envelope.body.error.code).toBe("INTERNAL_ERROR");
    expect(envelope.body.error.message).toBe("An unexpected error occurred.");
    expect(JSON.stringify(envelope.body)).not.toContain("postgresql://");
    expect("details" in envelope.body.error).toBe(false);
  });

  it("maps non-Error throwables to a generic 500", () => {
    const envelope = errorToEnvelope("boom");
    expect(envelope.status).toBe(500);
    expect(envelope.body.error.code).toBe("INTERNAL_ERROR");
  });
});
