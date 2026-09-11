import type { CreateUserInput, UpdateUserInput, UserListQuery } from "@msph/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { hashPassword } from "../../lib/password.js";
import { paginationArgs, toPaginated } from "../../lib/pagination.js";
import { toPublicUser } from "../../lib/serialize.js";
import { ApiError } from "../../middleware/errorHandler.js";

// See the equivalent note in customers.service.ts re: return types not
// being annotated with the shared (string-dates) wire type.

export async function listUsers(query: UserListQuery) {
  const where: Prisma.UserWhereInput = {
    ...(query.role ? { role: query.role } : {}),
    ...(query.active !== undefined ? { active: query.active } : {}),
  };

  const [items, total] = await Promise.all([
    prisma.user.findMany({ where, orderBy: { createdAt: "desc" }, ...paginationArgs(query) }),
    prisma.user.count({ where }),
  ]);

  return toPaginated(items.map(toPublicUser), total, query);
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw ApiError.notFound("User");
  return toPublicUser(user);
}

export async function createUser(input: CreateUserInput) {
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) throw ApiError.conflict("A user with this email already exists");

  const passwordHash = await hashPassword(input.password);
  const user = await prisma.user.create({
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      email: input.email,
      phone: input.phone,
      role: input.role,
      passwordHash,
    },
  });
  return toPublicUser(user);
}

export async function updateUser(id: string, actorId: string, input: UpdateUserInput) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw ApiError.notFound("User");

  // Guard rails so an admin can't accidentally lock themselves out.
  if (id === actorId) {
    if (input.active === false) throw ApiError.badRequest("You cannot deactivate your own account");
    if (input.role && input.role !== existing.role) throw ApiError.badRequest("You cannot change your own role");
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      firstName: input.firstName,
      lastName: input.lastName,
      phone: input.phone,
      role: input.role,
      active: input.active,
    },
  });
  return toPublicUser(user);
}
