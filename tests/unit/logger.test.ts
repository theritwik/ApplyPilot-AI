import { describe, expect, it } from "vitest";
import { buildLogger, scrub } from "@/lib/logger";

function captureLogger() {
  const lines: string[] = [];
  const logger = buildLogger(
    { level: "info" },
    {
      write(chunk: string) {
        lines.push(chunk);
      },
    },
  );
  return { logger, lines };
}

describe("logger redaction", () => {
  it("redacts document text fields at the top level", () => {
    const { logger, lines } = captureLogger();
    logger.info(
      { event: "resume.parsed", rawText: "Jane Doe 555-0100 secret resume body" },
      "parsed",
    );
    const output = lines.join("");
    expect(output).not.toContain("secret resume body");
    expect(output).toContain("[REDACTED]");
  });

  it("redacts nested and array-wrapped sensitive fields", () => {
    const { logger, lines } = captureLogger();
    logger.info({
      event: "debug",
      run: {
        suggestions: [{ suggestedText: "Led a team of 6", evidence: ["built X"] }],
        user: { email: "jane@example.com", phone: "555-0100" },
      },
    });
    const output = lines.join("");
    expect(output).not.toContain("Led a team of 6");
    expect(output).not.toContain("jane@example.com");
    expect(output).not.toContain("555-0100");
  });

  it("redacts credential-bearing fields regardless of casing/style", () => {
    const scrubbed = scrub({
      apiKey: "sk-live-123",
      API_KEY: "sk-live-456",
      sessionToken: "tok-789",
      Authorization: "Bearer abc",
    });
    expect(Object.values(scrubbed)).toEqual([
      "[REDACTED]",
      "[REDACTED]",
      "[REDACTED]",
      "[REDACTED]",
    ]);
  });

  it("keeps non-sensitive fields intact", () => {
    const { logger, lines } = captureLogger();
    logger.info({ event: "job.completed", jobRunId: "run_123", attempts: 2 });
    const output = lines.join("");
    expect(output).toContain("run_123");
    expect(output).toContain('"attempts":2');
  });
});
