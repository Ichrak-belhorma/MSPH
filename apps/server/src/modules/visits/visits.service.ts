import { Prisma } from "@prisma/client";
import {
  TERMINAL_CASE_STATUSES,
  VISIT_TYPE_LABELS,
  type AddVisitPhotoInput,
  type CompleteVisitInput,
  type RecordInspectionInput,
  type ScheduleVisitInput,
  type StartVisitInput,
  type UpdateVisitInput,
  type VisitListQuery,
  type Paginated,
} from "@msph/shared";
import { prisma } from "../../lib/prisma.js";
import { assertExists } from "../../lib/assertExists.js";
import { assertVisitAccess } from "../../lib/authz.js";
import { paginationArgs, toPaginated } from "../../lib/pagination.js";
import { ApiError } from "../../middleware/errorHandler.js";
import type { AuthUser } from "../../middleware/auth.js";
import { logCaseActivity } from "../cases/case-activity.js";
import { recalculateCaseStatus } from "../cases/case-status.js";

const visitInclude = {
  case: { include: { customer: true, property: true } },
  assignedWorker: { select: { id: true, firstName: true, lastName: true } },
  inspection: true,
} satisfies Prisma.VisitInclude;

export type VisitDetail = Prisma.VisitGetPayload<{ include: typeof visitInclude }>;

async function getVisitDetail(id: string): Promise<VisitDetail> {
  return prisma.visit.findUniqueOrThrow({ where: { id }, include: visitInclude });
}

export async function listVisits(query: VisitListQuery, requester: AuthUser): Promise<Paginated<VisitDetail>> {
  // Workers only ever see their own assigned visits (mobile Today/
  // Upcoming) — overrides whatever assignedWorkerId they sent.
  const assignedWorkerId = requester.role === "ADMIN" ? query.assignedWorkerId : requester.id;

  const where: Prisma.VisitWhereInput = {
    ...(query.caseId ? { caseId: query.caseId } : {}),
    ...(assignedWorkerId ? { assignedWorkerId } : {}),
    ...(query.status ? { status: query.status } : {}),
    ...(query.type ? { type: query.type } : {}),
    ...(query.from || query.to
      ? {
          scheduledAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };

  const [items, total] = await Promise.all([
    prisma.visit.findMany({ where, include: visitInclude, orderBy: { scheduledAt: "asc" }, ...paginationArgs(query) }),
    prisma.visit.count({ where }),
  ]);
  return toPaginated(items, total, query);
}

export async function getVisit(id: string, requester: AuthUser): Promise<VisitDetail> {
  const visit = await prisma.visit.findUnique({ where: { id }, include: visitInclude });
  if (!visit) throw ApiError.notFound("Visit");
  assertVisitAccess(visit.assignedWorkerId, requester);
  return visit;
}

/** ADMIN-only (route-enforced): "the company schedules the next
 * consultation/intervention date" and assigns a worker to it. */
export async function scheduleVisit(input: ScheduleVisitInput, actorId: string): Promise<VisitDetail> {
  const visitId = await prisma.$transaction(async (tx) => {
    const kase = await assertExists(() => tx.case.findUnique({ where: { id: input.caseId } }), "caseId does not refer to an existing case");
    if (TERMINAL_CASE_STATUSES.includes(kase.status)) {
      throw ApiError.badRequest(`Cannot schedule a visit on a ${kase.status.toLowerCase()} case`);
    }
    if (input.assignedWorkerId) {
      await assertExists(
        () => tx.user.findFirst({ where: { id: input.assignedWorkerId, active: true } }),
        "assignedWorkerId does not refer to an existing active user",
      );
    }

    const visit = await tx.visit.create({
      data: {
        caseId: input.caseId,
        type: input.type,
        scheduledAt: new Date(input.scheduledAt),
        assignedWorkerId: input.assignedWorkerId,
        notes: input.notes,
      },
    });

    await logCaseActivity(tx, {
      caseId: input.caseId,
      type: "VISIT_SCHEDULED",
      message: `${VISIT_TYPE_LABELS[input.type]} visit scheduled for ${visit.scheduledAt.toISOString()}`,
      actorId,
      metadata: { visitId: visit.id },
    });
    if (input.assignedWorkerId) {
      await logCaseActivity(tx, {
        caseId: input.caseId,
        type: "WORKER_ASSIGNED",
        message: "Worker assigned to visit",
        actorId,
        metadata: { visitId: visit.id, workerId: input.assignedWorkerId },
      });
    }

    await recalculateCaseStatus(tx, input.caseId, actorId);
    return visit.id;
  });

  return getVisitDetail(visitId);
}

/** ADMIN-only (route-enforced): reschedule, reassign, edit notes, or
 * cancel/mark-no-show a visit. A worker never reaches this route —
 * they act through start/complete below. */
export async function updateVisit(id: string, input: UpdateVisitInput, actorId: string): Promise<VisitDetail> {
  await prisma.$transaction(async (tx) => {
    const visit = await tx.visit.findUnique({ where: { id } });
    if (!visit) throw ApiError.notFound("Visit");

    if (input.assignedWorkerId) {
      await assertExists(
        () => tx.user.findFirst({ where: { id: input.assignedWorkerId!, active: true } }),
        "assignedWorkerId does not refer to an existing active user",
      );
    }

    const nextScheduledAt = input.scheduledAt ? new Date(input.scheduledAt) : undefined;

    await tx.visit.update({
      where: { id },
      data: {
        scheduledAt: nextScheduledAt,
        assignedWorkerId: input.assignedWorkerId,
        status: input.status,
        notes: input.notes,
      },
    });

    if (nextScheduledAt && nextScheduledAt.getTime() !== visit.scheduledAt.getTime()) {
      await logCaseActivity(tx, {
        caseId: visit.caseId,
        type: "VISIT_RESCHEDULED",
        message: `Visit rescheduled to ${nextScheduledAt.toISOString()}`,
        actorId,
        metadata: { visitId: id },
      });
    }
    if (input.assignedWorkerId !== undefined && input.assignedWorkerId !== visit.assignedWorkerId) {
      await logCaseActivity(tx, {
        caseId: visit.caseId,
        type: "WORKER_ASSIGNED",
        message: input.assignedWorkerId ? "Worker (re)assigned to visit" : "Worker unassigned from visit",
        actorId,
        metadata: { visitId: id, ...(input.assignedWorkerId ? { workerId: input.assignedWorkerId } : {}) },
      });
    }
    if (input.status === "CANCELLED" && visit.status !== "CANCELLED") {
      await logCaseActivity(tx, { caseId: visit.caseId, type: "VISIT_CANCELLED", message: "Visit cancelled", actorId, metadata: { visitId: id } });
    }

    await recalculateCaseStatus(tx, visit.caseId, actorId);
  });

  return getVisitDetail(id);
}

/** Worker taps "Start visit" (or admin does it on their behalf). */
export async function startVisit(id: string, input: StartVisitInput, requester: AuthUser): Promise<VisitDetail> {
  await prisma.$transaction(async (tx) => {
    const visit = await tx.visit.findUnique({ where: { id } });
    if (!visit) throw ApiError.notFound("Visit");
    assertVisitAccess(visit.assignedWorkerId, requester);
    if (visit.status === "COMPLETED" || visit.status === "CANCELLED") {
      throw ApiError.badRequest(`Cannot start a visit that is already ${visit.status.toLowerCase()}`);
    }

    const startedAt = input.startedAt ? new Date(input.startedAt) : new Date();
    await tx.visit.update({ where: { id }, data: { status: "IN_PROGRESS", startedAt } });
    await logCaseActivity(tx, { caseId: visit.caseId, type: "VISIT_STARTED", message: "Visit started", actorId: requester.id, metadata: { visitId: id } });
    await recalculateCaseStatus(tx, visit.caseId, requester.id);
  });

  return getVisitDetail(id);
}

/** Worker taps "Complete visit" — also records the inspection fields in
 * the same step when provided (see CompleteVisitInput's doc comment). */
export async function completeVisit(id: string, input: CompleteVisitInput, requester: AuthUser): Promise<VisitDetail> {
  await prisma.$transaction(async (tx) => {
    const visit = await tx.visit.findUnique({ where: { id } });
    if (!visit) throw ApiError.notFound("Visit");
    assertVisitAccess(visit.assignedWorkerId, requester);
    if (visit.status === "CANCELLED") throw ApiError.badRequest("Cannot complete a cancelled visit");

    const completedAt = input.completedAt ? new Date(input.completedAt) : new Date();
    await tx.visit.update({
      where: { id },
      data: { status: "COMPLETED", completedAt, startedAt: visit.startedAt ?? completedAt },
    });
    await logCaseActivity(tx, {
      caseId: visit.caseId,
      type: "VISIT_COMPLETED",
      message: "Visit completed",
      actorId: requester.id,
      metadata: { visitId: id },
    });

    const hasInspectionData = input.observations !== undefined || input.remarks !== undefined || input.condition !== undefined;
    if (hasInspectionData) {
      await tx.inspection.upsert({
        where: { visitId: id },
        create: { visitId: id, observations: input.observations, remarks: input.remarks, condition: input.condition },
        update: { observations: input.observations, remarks: input.remarks, condition: input.condition },
      });
      await logCaseActivity(tx, {
        caseId: visit.caseId,
        type: "INSPECTION_RECORDED",
        message: "Inspection details recorded",
        actorId: requester.id,
        metadata: { visitId: id },
      });
    }

    await recalculateCaseStatus(tx, visit.caseId, requester.id);
  });

  return getVisitDetail(id);
}

/** POST /visits/:id/inspection — records/updates the inspection
 * independently of completing the visit (e.g. an admin correcting it
 * after the fact, or a worker filling it in before tapping complete). */
export async function recordInspection(id: string, input: RecordInspectionInput, requester: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const visit = await tx.visit.findUnique({ where: { id } });
    if (!visit) throw ApiError.notFound("Visit");
    assertVisitAccess(visit.assignedWorkerId, requester);

    const inspection = await tx.inspection.upsert({
      where: { visitId: id },
      create: { visitId: id, ...input },
      update: { ...input },
    });

    await logCaseActivity(tx, {
      caseId: visit.caseId,
      type: "INSPECTION_RECORDED",
      message: "Inspection details recorded",
      actorId: requester.id,
      metadata: { visitId: id },
    });

    return inspection;
  });
}

/** POST /visits/:id/photos — metadata only, see AddVisitPhotoInput's doc
 * comment for why there's no binary upload here yet. */
export async function addPhotoToVisit(id: string, input: AddVisitPhotoInput, requester: AuthUser) {
  return prisma.$transaction(async (tx) => {
    const visit = await tx.visit.findUnique({ where: { id } });
    if (!visit) throw ApiError.notFound("Visit");
    assertVisitAccess(visit.assignedWorkerId, requester);

    const photo = await tx.photo.create({
      data: {
        caseId: visit.caseId,
        visitId: id,
        storageKey: input.storageKey,
        url: input.url,
        caption: input.caption,
        uploadedBy: requester.id,
      },
    });

    await logCaseActivity(tx, {
      caseId: visit.caseId,
      type: "PHOTO_ADDED",
      message: "Photo added",
      actorId: requester.id,
      metadata: { visitId: id, photoId: photo.id },
    });

    return photo;
  });
}
