import { UserRole } from "@msph/shared";
import { prisma } from "./prisma.js";
import { ApiError } from "../middleware/errorHandler.js";
import type { AuthUser } from "../middleware/auth.js";

/**
 * Cross-module authorization helpers.
 *
 * The brief: a worker sees "assigned visits/cases" and "relevant
 * customer/property information" — but nothing about cases or visits they
 * aren't assigned to. Rather than a permissions table, "assigned" is
 * derived directly from the data: a worker has access to a case if they
 * are `assignedWorkerId` on at least one of its visits. Admins always
 * have access to everything.
 */
export async function workerHasCaseAccess(caseId: string, workerId: string): Promise<boolean> {
  const visit = await prisma.visit.findFirst({ where: { caseId, assignedWorkerId: workerId }, select: { id: true } });
  return visit !== null;
}

/** Throws 403 if a non-admin requester has no assigned visit on this case. */
export async function assertCaseAccess(caseId: string, requester: AuthUser): Promise<void> {
  if (requester.role === UserRole.ADMIN) return;
  const allowed = await workerHasCaseAccess(caseId, requester.id);
  if (!allowed) throw ApiError.forbidden("You do not have access to this case");
}

/** Throws 403 if a non-admin requester is not the assigned worker on this
 * specific visit (stricter than case access — used for start/complete/
 * inspection/photos, actions that belong to the worker actually doing the
 * visit, not any worker who happens to share the case). */
export function assertVisitAccess(visitAssignedWorkerId: string | null, requester: AuthUser): void {
  if (requester.role === UserRole.ADMIN) return;
  if (visitAssignedWorkerId !== requester.id) {
    throw ApiError.forbidden("You are not assigned to this visit");
  }
}
