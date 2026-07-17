import { beforeEach, describe, expect, it, vi } from "vitest";

const queryRawMock = vi.fn();
const pingMock = vi.fn();
const s3SendMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  prisma: { $queryRaw: (...args: unknown[]) => queryRawMock(...args) },
}));

vi.mock("@/lib/redis", () => ({
  redis: { ping: () => pingMock() },
}));

vi.mock("@/server/storage/s3-client", () => ({
  s3Client: { send: (...args: unknown[]) => s3SendMock(...args) },
  s3Bucket: "applypilot-dev",
}));

// prisma.$queryRaw is used as a tagged template in the route; a plain
// function mock works because tagged-template calls invoke the same
// function with (strings, ...values).
queryRawMock.mockImplementation(() => Promise.resolve([{ "?column?": 1 }]));

const { GET } = await import("@/app/api/ready/route");

interface ReadyBody {
  status: "ok" | "error";
  checks: {
    postgres: { status: string };
    redis: { status: string };
    objectStorage: { status: string };
  };
}

describe("GET /api/ready", () => {
  beforeEach(() => {
    queryRawMock.mockReset().mockImplementation(() => Promise.resolve([{ "?column?": 1 }]));
    pingMock.mockReset().mockResolvedValue("PONG");
    s3SendMock.mockReset().mockResolvedValue({});
  });

  it("returns 200 and reports each dependency as ok when all are reachable", async () => {
    const response = await GET();
    const body = (await response.json()) as ReadyBody;

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.checks.postgres.status).toBe("ok");
    expect(body.checks.redis.status).toBe("ok");
    expect(body.checks.objectStorage.status).toBe("ok");
  });

  it("returns 503 and flags postgres when it is down", async () => {
    queryRawMock.mockImplementation(() => Promise.reject(new Error("connection refused")));

    const response = await GET();
    const body = (await response.json()) as ReadyBody;

    expect(response.status).toBe(503);
    expect(body.status).toBe("error");
    expect(body.checks.postgres.status).toBe("error");
    expect(body.checks.redis.status).toBe("ok");
    expect(body.checks.objectStorage.status).toBe("ok");
  });

  it("returns 503 and flags redis when it is down", async () => {
    pingMock.mockRejectedValue(new Error("connection refused"));

    const response = await GET();
    const body = (await response.json()) as ReadyBody;

    expect(response.status).toBe(503);
    expect(body.checks.redis.status).toBe("error");
    expect(body.checks.postgres.status).toBe("ok");
    expect(body.checks.objectStorage.status).toBe("ok");
  });

  it("returns 503 and flags object storage when it is down", async () => {
    s3SendMock.mockRejectedValue(new Error("bucket not found"));

    const response = await GET();
    const body = (await response.json()) as ReadyBody;

    expect(response.status).toBe(503);
    expect(body.checks.objectStorage.status).toBe("error");
    expect(body.checks.postgres.status).toBe("ok");
    expect(body.checks.redis.status).toBe("ok");
  });

  it("returns 503 when every dependency is down", async () => {
    queryRawMock.mockImplementation(() => Promise.reject(new Error("down")));
    pingMock.mockRejectedValue(new Error("down"));
    s3SendMock.mockRejectedValue(new Error("down"));

    const response = await GET();
    const body = (await response.json()) as ReadyBody;

    expect(response.status).toBe(503);
    expect(body.checks.postgres.status).toBe("error");
    expect(body.checks.redis.status).toBe("error");
    expect(body.checks.objectStorage.status).toBe("error");
  });
});
