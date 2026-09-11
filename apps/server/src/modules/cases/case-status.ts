import type { Prisma, PrismaClient } from "@prisma/client";
import { CaseStatus, TERMINAL_CASE_STATUSES } from "@msph/shared";
import { logCaseActivity } from "./case-activity.js";

type Tx = Prisma.TransactionClient | PrismaClient;

/**
 * Case status state machine.
 *
 * `Case.status` is intentionally coarse (see packages/shared/src/enums.ts)
 * and — outside the two explicit admin actions below — is never set
 * directly by a route handler. Instead, every visit create/start/complete/
 * cancel calls `recalculateCaseStatus`, which derives the right bucket
 * from the case's current visit history:
 *
 *   - no visits at all                        -> NEW
 *   - at least one SCHEDULED/IN_PROGRESS visit,
 *     none COMPLETED yet                       -> SCHEDULED
 *   - at least one COMPLETED visit             -> IN_PROGRESS
 *
 * This makes the everyday workflow (schedule inspection -> perform it ->
 * schedule follow-up -> perform it -> ...) fall out automatically, however
 * many loops it takes, without ever needing a "FOLLOW_UP_SCHEDULED_2"
 * style enum value.
 *
 * RESOLVED and CANCELLED are terminal and are the two actions the brief
 * reserves for admins ("mark cases resolved"). Once a case is in either
 * state, `recalculateCaseStatus` is a no-op — only an explicit admin
 * PATCH /cases/:id can move it out again (reopening a case), which is a
 * deliberate human decision, never inferred from visit data.
 */
export async function recalculateCaseStatus(tx: Tx, caseId: string, actorId?: string | null): Promise<void> {
  const kase = await tx.case.findUnique({ where: { id: caseId } });
  if (!kase || TERMINAL_CASE_STATUSES.includes(kase.status)) return;

  const visits = await tx.visit.findMany({ where: { caseId }, select: { status: true } });
  const hasCompleted = visits.some((v) => v.status === "COMPLETED");
  const hasActive = visits.some((v) => v.status === "SCHEDULED" || v.status === "IN_PROGRESS");

  const next: CaseStatus = hasCompleted ? CaseStatus.IN_PROGRESS : hasActive ? CaseStatus.SCHEDULED : CaseStatus.NEW;

  if (next === kase.status) return;

  await tx.case.update({ where: { id: caseId }, data: { status: next } });
  await logCaseActivity(tx, {
    caseId,
    type: "STATUS_CHANGED",
    message: `Case status automatically changed from ${kase.status} to ${next}`,
    actorId: actorId ?? null,
    metadata: { from: kase.status, to: next, reason: "auto" },
  });
}

/** Explicit admin action: resolve or cancel a case (or reopen one). Sets
 * `resolvedAt` on entering RESOLVED, clears it otherwise. */
export async function applyExplicitStatus(
  tx: Tx,
  caseId: string,
  status: CaseStatus,
  actorId: string,
): Promise<void> {
  const kase = await tx.case.findUnique({ where: { id: caseId } });
  if (!kase || kase.status === status) return;

  await tx.case.update({
    where: { id: caseId },
    data: { status, resolvedAt: status === CaseStatus.RESOLVED ? new Date() : null },
  });

  await logCaseActivity(tx, {
    caseId,
    type: status === CaseStatus.RESOLVED ? "CASE_RESOLVED" : status === CaseStatus.CANCELLED ? "CASE_CANCELLED" : "STATUS_CHANGED",
    message: `Status changed from ${kase.status} to ${status}`,
    actorId,
    metadata: { from: kase.status, to: status, reason: "manual" },
  });
}
