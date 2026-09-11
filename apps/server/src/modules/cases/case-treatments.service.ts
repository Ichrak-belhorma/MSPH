import { Prisma } from "@prisma/client";
import type { AssignTreatmentToCaseInput, UpdateCaseTreatmentInput } from "@msph/shared";
import { prisma } from "../../lib/prisma.js";
import { assertExists } from "../../lib/assertExists.js";
import { ApiError } from "../../middleware/errorHandler.js";
import { logCaseActivity } from "./case-activity.js";

const caseTreatmentInclude = { treatment: true } satisfies Prisma.CaseTreatmentInclude;

/** ADMIN-only (enforced at the route): "the company chooses one or
 * several treatments" (brief step 6-7). */
export async function addTreatmentToCase(caseId: string, input: AssignTreatmentToCaseInput, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const kase = await tx.case.findUnique({ where: { id: caseId } });
    if (!kase) throw ApiError.notFound("Case");
    const treatment = await assertExists(
      () => tx.treatment.findUnique({ where: { id: input.treatmentId } }),
      "treatmentId does not refer to an existing treatment",
    );
    if (input.visitId) {
      await assertExists(
        () => tx.visit.findFirst({ where: { id: input.visitId, caseId } }),
        "visitId does not refer to a visit on this case",
      );
    }

    const caseTreatment = await tx.caseTreatment.create({
      data: { caseId, treatmentId: input.treatmentId, visitId: input.visitId, notes: input.notes },
      include: caseTreatmentInclude,
    });

    await logCaseActivity(tx, {
      caseId,
      type: "TREATMENT_ADDED",
      message: `Treatment "${treatment.name}" added to case`,
      actorId,
      metadata: { caseTreatmentId: caseTreatment.id, treatmentId: treatment.id },
    });

    return caseTreatment;
  });
}

/**
 * ADMIN or the case's assigned worker (checked at the route via
 * assertCaseAccess): "record treatment execution" (brief, Worker
 * permissions). Adding/removing treatments stays ADMIN-only — a worker
 * can mark an already-chosen treatment performed, not decide which
 * treatments the case gets.
 */
export async function updateCaseTreatment(
  caseId: string,
  caseTreatmentId: string,
  input: UpdateCaseTreatmentInput,
  actorId: string,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.caseTreatment.findFirst({
      where: { id: caseTreatmentId, caseId },
      include: caseTreatmentInclude,
    });
    if (!existing) throw ApiError.notFound("Case treatment");

    let performedAt: Date | undefined;
    if (input.performedAt) {
      performedAt = new Date(input.performedAt);
    } else if (input.status === "COMPLETED" && !existing.performedAt) {
      performedAt = new Date();
    }

    const updated = await tx.caseTreatment.update({
      where: { id: existing.id },
      data: {
        status: input.status,
        notes: input.notes,
        performedAt,
        performedBy: input.status === "COMPLETED" ? actorId : undefined,
      },
      include: caseTreatmentInclude,
    });

    await logCaseActivity(tx, {
      caseId,
      type: "TREATMENT_UPDATED",
      message:
        input.status === "COMPLETED"
          ? `Treatment "${existing.treatment.name}" recorded as performed`
          : `Treatment "${existing.treatment.name}" updated`,
      actorId,
      metadata: { caseTreatmentId: existing.id, status: updated.status },
    });

    return updated;
  });
}

/** ADMIN-only. Keyed by the CaseTreatment row's own id rather than the
 * catalog treatmentId (deviation from the brief's literal `DELETE
 * /cases/:id/treatments/:treatmentId` — see CONTEXT.md): a case could in
 * principle have the same catalog treatment attached more than once
 * across rounds, so the join row's own id is the only unambiguous key. */
export async function removeTreatmentFromCase(caseId: string, caseTreatmentId: string, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const existing = await tx.caseTreatment.findFirst({
      where: { id: caseTreatmentId, caseId },
      include: caseTreatmentInclude,
    });
    if (!existing) throw ApiError.notFound("Case treatment");

    await tx.caseTreatment.delete({ where: { id: existing.id } });

    await logCaseActivity(tx, {
      caseId,
      type: "TREATMENT_REMOVED",
      message: `Treatment "${existing.treatment.name}" removed from case`,
      actorId,
      metadata: { caseTreatmentId: existing.id, treatmentId: existing.treatmentId },
    });
  });
}
