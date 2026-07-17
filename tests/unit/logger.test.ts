import { Writable } from "node:stream";

import { describe, expect, it } from "vitest";

import { createLogger } from "@/lib/logger";

function collectingStream() {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, callback) {
      chunks.push(chunk.toString());
      callback();
    },
  });
  return { stream, chunks };
}

// pino batches writes to non-file destinations via setImmediate for
// throughput, so tests must yield the event loop before asserting on the
// captured stream output.
function nextTick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

describe("logger redaction", () => {
  it("redacts known sensitive fields and never emits their raw values", async () => {
    const { stream, chunks } = collectingStream();
    const testLogger = createLogger(stream, "info");

    testLogger.info(
      {
        password: "hunter2",
        token: "abc123",
        user: { email: "person@example.com", phone: "555-0100" },
        rawText: "This resume contains a name and an address.",
      },
      "test event",
    );
    await nextTick();

    const output = chunks.join("");
    const parsed = JSON.parse(output) as Record<string, unknown>;

    expect(output).not.toContain("hunter2");
    expect(output).not.toContain("abc123");
    expect(output).not.toContain("person@example.com");
    expect(output).not.toContain("555-0100");
    expect(output).not.toContain("This resume contains a name and an address.");

    expect(parsed.password).toBe("[REDACTED]");
    expect(parsed.token).toBe("[REDACTED]");
    expect(parsed.rawText).toBe("[REDACTED]");
    expect((parsed.user as Record<string, unknown>).email).toBe("[REDACTED]");
    expect((parsed.user as Record<string, unknown>).phone).toBe("[REDACTED]");
  });

  it("leaves non-sensitive fields untouched", async () => {
    const { stream, chunks } = collectingStream();
    const testLogger = createLogger(stream, "info");

    testLogger.info({ jobRunId: "run_123", status: "COMPLETED" }, "job run completed");
    await nextTick();

    const parsed = JSON.parse(chunks.join("")) as Record<string, unknown>;
    expect(parsed.jobRunId).toBe("run_123");
    expect(parsed.status).toBe("COMPLETED");
  });
});
