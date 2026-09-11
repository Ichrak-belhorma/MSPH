import type { CreatePropertyInput, PeopleListQuery, UpdatePropertyInput } from "@msph/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { paginationArgs, toPaginated } from "../../lib/pagination.js";
import { ApiError } from "../../middleware/errorHandler.js";

// See the equivalent note in customers.service.ts re: return types not
// being annotated with the shared (string-dates) wire type.

function searchWhere(search?: string): Prisma.PropertyWhereInput {
  if (!search) return {};
  return {
    OR: [
      { address: { contains: search, mode: "insensitive" } },
      { city: { contains: search, mode: "insensitive" } },
      { postalCode: { contains: search, mode: "insensitive" } },
    ],
  };
}

async function assertLandlordExists(landlordId: string | null | undefined): Promise<void> {
  if (!landlordId) return;
  const landlord = await prisma.landlord.findUnique({ where: { id: landlordId } });
  if (!landlord) throw ApiError.badRequest("landlordId does not refer to an existing landlord");
}

export async function listProperties(query: PeopleListQuery) {
  const where = searchWhere(query.search);
  const [items, total] = await Promise.all([
    prisma.property.findMany({
      where,
      include: { landlord: true },
      orderBy: { createdAt: "desc" },
      ...paginationArgs(query),
    }),
    prisma.property.count({ where }),
  ]);
  return toPaginated(items, total, query);
}

export async function getProperty(id: string) {
  const property = await prisma.property.findUnique({ where: { id }, include: { landlord: true } });
  if (!property) throw ApiError.notFound("Property");
  return property;
}

export async function createProperty(input: CreatePropertyInput) {
  await assertLandlordExists(input.landlordId);
  return prisma.property.create({ data: input, include: { landlord: true } });
}

export async function updateProperty(id: string, input: UpdatePropertyInput) {
  await getProperty(id);
  await assertLandlordExists(input.landlordId);
  return prisma.property.update({ where: { id }, data: input, include: { landlord: true } });
}
