import type { CreateTreatmentInput, TreatmentListQuery, UpdateTreatmentInput } from "@msph/shared";
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { paginationArgs, toPaginated } from "../../lib/pagination.js";
import { ApiError } from "../../middleware/errorHandler.js";

// See the equivalent note in customers.service.ts re: return types not
// being annotated with the shared (string-dates) wire type.

export async function listTreatments(query: TreatmentListQuery) {
  const where: Prisma.TreatmentWhereInput = {
    // Hide retired treatments from the picker by default; pass
    // active=false explicitly to see retired ones too.
    active: query.active ?? true,
    ...(query.search
      ? { OR: [{ name: { contains: query.search, mode: "insensitive" } }, { description: { contains: query.search, mode: "insensitive" } }] }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.treatment.findMany({ where, orderBy: { name: "asc" }, ...paginationArgs(query) }),
    prisma.treatment.count({ where }),
  ]);
  return toPaginated(items, total, query);
}

export async function getTreatment(id: string) {
  const treatment = await prisma.treatment.findUnique({ where: { id } });
  if (!treatment) throw ApiError.notFound("Treatment");
  return treatment;
}

export function createTreatment(input: CreateTreatmentInput) {
  return prisma.treatment.create({ data: input });
}

export async function updateTreatment(id: string, input: UpdateTreatmentInput) {
  await getTreatment(id);
  return prisma.treatment.update({ where: { id }, data: input });
}
