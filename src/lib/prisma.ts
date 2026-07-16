import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { getEnv } from "./env";

/**
 * Lazily constructed Prisma client singleton (Prisma 7, pg driver adapter).
 * Cached on globalThis so Next.js dev-mode HMR does not leak connections.
 * Lazy so that importing this module never requires a database (build safety).
 */

const globalCache = globalThis as unknown as { __applypilotPrisma?: PrismaClient };

export function getPrisma(): PrismaClient {
  if (!globalCache.__applypilotPrisma) {
    const adapter = new PrismaPg({ connectionString: getEnv().DATABASE_URL });
    globalCache.__applypilotPrisma = new PrismaClient({ adapter });
  }
  return globalCache.__applypilotPrisma;
}
