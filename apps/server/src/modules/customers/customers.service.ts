import type { CreateCustomerInput, PeopleListQuery, UpdateCustomerInput } from "@msph/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { paginationArgs, toPaginated } from "../../lib/pagination.js";
import { ApiError } from "../../middleware/errorHandler.js";

// Note on return types throughout this file: Prisma returns `Date`
// objects; the shared `Customer` type describes the post-JSON wire shape
// (ISO date strings — see packages/shared/src/types/entities.ts's doc
// comment). Annotating these functions as `Promise<Customer>` would be a
// type lie — they're left to infer Prisma's real shape, and
// `res.json()` performs the Date -> ISO string conversion at the actual
// API boundary, where the shared type's contract actually applies.

function searchWhere(search?: string): Prisma.CustomerWhereInput {
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

export async function listCustomers(query: PeopleListQuery) {
  const where = searchWhere(query.search);
  const [items, total] = await Promise.all([
    prisma.customer.findMany({ where, orderBy: { createdAt: "desc" }, ...paginationArgs(query) }),
    prisma.customer.count({ where }),
  ]);
  return toPaginated(items, total, query);
}

export async function getCustomer(id: string) {
  const customer = await prisma.customer.findUnique({ where: { id } });
  if (!customer) throw ApiError.notFound("Customer");
  return customer;
}

export function createCustomer(input: CreateCustomerInput) {
  return prisma.customer.create({ data: input });
}

export async function updateCustomer(id: string, input: UpdateCustomerInput) {
  await getCustomer(id);
  return prisma.customer.update({ where: { id }, data: input });
}
