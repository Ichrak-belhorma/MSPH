import type { User as PrismaUser } from "@prisma/client";

/** Strips `passwordHash` before a User ever reaches `res.json()`. Every
 * route that returns a user MUST go through this — never spread/return a
 * raw Prisma User object. */
export function toPublicUser<T extends PrismaUser>(user: T): Omit<T, "passwordHash"> {
  const { passwordHash: _passwordHash, ...rest } = user;
  return rest;
}
