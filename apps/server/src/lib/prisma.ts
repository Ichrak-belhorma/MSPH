import { PrismaClient } from "@prisma/client";
import { env } from "../config/env.js";

/**
 * Single shared Prisma Client instance. In dev, `tsx watch` re-executes the
 * module on every file change; stashing the client on `globalThis` avoids
 * exhausting the Postgres connection pool by creating a fresh client per
 * reload.
 */
declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

export const prisma =
  globalThis.__prisma ??
  new PrismaClient({
    log: env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (env.NODE_ENV !== "production") {
  globalThis.__prisma = prisma;
}
