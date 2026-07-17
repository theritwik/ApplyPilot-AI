import { PrismaClient } from "@prisma/client";

import { env } from "@/lib/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

// Reuse the client across hot reloads in development to avoid exhausting
// Postgres connections.
if (env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
