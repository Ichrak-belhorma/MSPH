import type { CreateLandlordInput, PeopleListQuery, UpdateLandlordInput } from "@msph/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { paginationArgs, toPaginated } from "../../lib/pagination.js";
import { ApiError } from "../../middleware/errorHandler.js";

// See the equivalent note in customers.service.ts re: return types not
// being annotated with the shared (string-dates) wire type.

function searchWhere(search?: string): Prisma.LandlordWhereInput {
  if (!search) return {};
  return {
    OR: [
      { firstName: { contains: search, mode: "insensitive" } },
      { lastName: { contains: search, mode: "insensitive" } },
      { email: { contains: search, mode: "insensitive" } },
      { phone: { contains: search, mode: "insensitive" } },
    ],
  };
}

export async function listLandlords(query: PeopleListQuery) {
  const where = searchWhere(query.search);
  const [items, total] = await Promise.all([
    prisma.landlord.findMany({ where, orderBy: { createdAt: "desc" }, ...paginationArgs(query) }),
    prisma.landlord.count({ where }),
  ]);
  return toPaginated(items, total, query);
}

export async function getLandlord(id: string) {
  const landlord = await prisma.landlord.findUnique({ where: { id } });
  if (!landlord) throw ApiError.notFound("Landlord");
  return landlord;
}

export function createLandlord(input: CreateLandlordInput) {
  return prisma.landlord.create({ data: input });
}

export async function updateLandlord(id: string, input: UpdateLandlordInput) {
  await getLandlord(id);
  return prisma.landlord.update({ where: { id }, data: input });
}
