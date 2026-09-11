import { Prisma } from "@prisma/client";
import type { CaseListQuery, CreateCaseInput, Paginated, UpdateCaseInput } from "@msph/shared";
import { prisma } from "../../lib/prisma.js";
import { assertExists } from "../../lib/assertExists.js";
import { paginationArgs, toPaginated } from "../../lib/pagination.js";
import { assertCaseAccess } from "../../lib/authz.js";
import { ApiError } from "../../middleware/errorHandler.js";
import type { AuthUser } from "../../middleware/auth.js";
import { logCaseActivity } from "./case-activity.js";
import { applyExplicitStatus, recalculateCaseStatus } from "./case-status.js";

/** Full detail shape for GET /cases/:id — matches
 * packages/shared/src/types/entities.ts `CaseWithRelations`. */
const caseInclude = {
  customer: true,
  property: { include: { landlord: true } },
  visits: {
    orderBy: { scheduledAt: "asc" },
    include: {
      assignedWorker: { select: { id: true, firstName: true, lastName: true } },
      inspection: true,
    },
  },
  photos: { orderBy: { createdAt: "asc" } },
  treatments: { include: { treatment: true }, orderBy: { createdAt: "asc" } },
  activities: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.CaseInclude;

export type CaseDetail = Prisma.CaseGetPayload<{ include: typeof caseInclude }>;

const caseListInclude = {
  customer: true,
  property: true,
} satisfies Prisma.CaseInclude;

export type CaseListItem = Prisma.CaseGetPayload<{ include: typeof caseListInclude }>;

export async function createCase(input: CreateCaseInput, actorId: string): Promise<CaseDetail> {
  const caseId = await prisma.$transaction(async (tx) => {
    let customerId = input.customerId;
    if (customerId) {
      await assertExists(() => tx.customer.findUnique({ where: { id: customerId } }), "customerId does not refer to an existing customer");
    } else {
      const customer = await tx.customer.create({ data: input.customer! });
      customerId = customer.id;
    }

    let propertyId = input.propertyId;
    if (propertyId) {
      await assertExists(() => tx.property.findUnique({ where: { id: propertyId } }), "propertyId does not refer to an existing property");
    } else {
      const p = input.property!;
      let landlordId = p.landlordId;
      if (landlordId) {
        await assertExists(() => tx.landlord.findUnique({ where: { id: landlordId } }), "property.landlordId does not refer to an existing landlord");
      } else if (p.landlord) {
        landlordId = (await tx.landlord.create({ data: p.landlord })).id;
      }
      const property = await tx.property.create({
        data: {
          address: p.address,
          city: p.city,
          postalCode: p.postalCode,
          additionalAddressInformation: p.additionalAddressInformation,
          landlordId,
        },
      });
      propertyId = property.id;
    }

    if (input.assignedWorkerId) {
      await assertExists(
        () => tx.user.findFirst({ where: { id: input.assignedWorkerId, active: true } }),
        "assignedWorkerId does not refer to an existing active user",
      );
    }

    const kase = await tx.case.create({
      data: { customerId, propertyId, problemDescription: input.problemDescription, priority: input.priority },
    });

    await logCaseActivity(tx, { caseId: kase.id, type: "CASE_CREATED", message: "Case created", actorId });

    if (input.initialVisitScheduledAt) {
      const visit = await tx.visit.create({
        data: {
          caseId: kase.id,
          type: "INITIAL_INSPECTION",
          scheduledAt: new Date(input.initialVisitScheduledAt),
          assignedWorkerId: input.assignedWorkerId,
        },
      });
      await logCaseActivity(tx, {
        caseId: kase.id,
        type: "VISIT_SCHEDULED",
        message: `Initial inspection scheduled for ${visit.scheduledAt.toISOString()}`,
        actorId,
        metadata: { visitId: visit.id },
      });
      if (input.assignedWorkerId) {
        await logCaseActivity(tx, {
          caseId: kase.id,
          type: "WORKER_ASSIGNED",
          message: "Worker assigned to initial inspection",
          actorId,
          metadata: { visitId: visit.id, workerId: input.assignedWorkerId },
        });
      }
      await recalculateCaseStatus(tx, kase.id, actorId);
    }

    return kase.id;
  });

  return prisma.case.findUniqueOrThrow({ where: { id: caseId }, include: caseInclude });
}

export async function listCases(query: CaseListQuery, requester: AuthUser): Promise<Paginated<CaseListItem>> {
  // Workers only ever see cases they have an assigned visit on — this
  // overrides whatever assignedWorkerId they might have sent.
  const assignedWorkerId = requester.role === "ADMIN" ? query.assignedWorkerId : requester.id;

  const where: Prisma.CaseWhereInput = {
    ...(query.status ? { status: query.status } : {}),
    ...(assignedWorkerId ? { visits: { some: { assignedWorkerId } } } : {}),
    ...(query.search
      ? {
          OR: [
            { problemDescription: { contains: query.search, mode: "insensitive" } },
            { customer: { firstName: { contains: query.search, mode: "insensitive" } } },
            { customer: { lastName: { contains: query.search, mode: "insensitive" } } },
            { property: { address: { contains: query.search, mode: "insensitive" } } },
            { property: { city: { contains: query.search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.case.findMany({ where, include: caseListInclude, orderBy: { createdAt: "desc" }, ...paginationArgs(query) }),
    prisma.case.count({ where }),
  ]);
  return toPaginated(items, total, query);
}

export async function getCase(id: string, requester: AuthUser): Promise<CaseDetail> {
  await assertCaseAccess(id, requester);
  const kase = await prisma.case.findUnique({ where: { id }, include: caseInclude });
  if (!kase) throw ApiError.notFound("Case");
  return kase;
}

export async function getCaseTimeline(id: string, requester: AuthUser) {
  await assertCaseAccess(id, requester);
  const exists = await prisma.case.findUnique({ where: { id }, select: { id: true } });
  if (!exists) throw ApiError.notFound("Case");
  return prisma.caseActivity.findMany({ where: { caseId: id }, orderBy: { createdAt: "asc" } });
}

/** ADMIN-only (enforced at the route) — direct edits to the case record
 * plus the two explicit lifecycle actions (resolve/cancel/reopen). */
export async function updateCase(id: string, input: UpdateCaseInput, actorId: string): Promise<CaseDetail> {
  await prisma.$transaction(async (tx) => {
    const kase = await tx.case.findUnique({ where: { id } });
    if (!kase) throw ApiError.notFound("Case");

    if (input.status && input.status !== kase.status) {
      await applyExplicitStatus(tx, id, input.status, actorId);
    }

    if (input.problemDescription !== undefined || input.priority !== undefined) {
      await tx.case.update({
        where: { id },
        data: { problemDescription: input.problemDescription, priority: input.priority },
      });
    }
  });

  return prisma.case.findUniqueOrThrow({ where: { id }, include: caseInclude });
}
