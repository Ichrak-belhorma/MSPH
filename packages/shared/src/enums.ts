/**
 * Domain enums shared by the server (Prisma schema mirrors these exactly),
 * desktop and mobile apps. Keep this file in sync with
 * apps/server/prisma/schema.prisma — Prisma generates its own enum types,
 * but application code should import these instead so desktop/mobile don't
 * need a Prisma Client dependency.
 */

export const UserRole = {
  ADMIN: "ADMIN",
  WORKER: "WORKER",
} as const;
export type UserRole = (typeof UserRole)[keyof typeof UserRole];

/**
 * Case lifecycle.
 *
 * Deliberately coarse (5 states) rather than the finer-grained linear list
 * sketched in the product brief (NEW / SCHEDULED / INSPECTION_COMPLETED /
 * TREATMENT_PLANNED / FOLLOW_UP_SCHEDULED / IN_PROGRESS / RESOLVED /
 * CANCELLED). A real case is not linear: it can loop through several
 * inspection/treatment/follow-up visits before resolution, so "which stage
 * is this case at" is better answered by looking at its Visits than by a
 * single field that would have to be re-used or extended every time a case
 * needs a second follow-up. See CONTEXT.md "Domain decisions" for the full
 * rationale. Dashboard buckets like "scheduled consultations" or "waiting
 * for follow-up" are derived by querying Visit (type + scheduledAt), not
 * from Case.status alone.
 */
export const CaseStatus = {
  /** Case created from the manual intake workflow, nothing scheduled yet. */
  NEW: "NEW",
  /** At least one upcoming visit is scheduled and not yet completed. */
  SCHEDULED: "SCHEDULED",
  /** Case has an inspection/treatment history and is actively being worked. */
  IN_PROGRESS: "IN_PROGRESS",
  /** Problem confirmed resolved. Terminal state. */
  RESOLVED: "RESOLVED",
  /** Case abandoned/withdrawn before resolution. Terminal state. */
  CANCELLED: "CANCELLED",
} as const;
export type CaseStatus = (typeof CaseStatus)[keyof typeof CaseStatus];

export const CasePriority = {
  LOW: "LOW",
  MEDIUM: "MEDIUM",
  HIGH: "HIGH",
  URGENT: "URGENT",
} as const;
export type CasePriority = (typeof CasePriority)[keyof typeof CasePriority];

export const VisitType = {
  INITIAL_INSPECTION: "INITIAL_INSPECTION",
  TREATMENT: "TREATMENT",
  FOLLOW_UP: "FOLLOW_UP",
  OTHER: "OTHER",
} as const;
export type VisitType = (typeof VisitType)[keyof typeof VisitType];

export const VisitStatus = {
  SCHEDULED: "SCHEDULED",
  IN_PROGRESS: "IN_PROGRESS",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const;
export type VisitStatus = (typeof VisitStatus)[keyof typeof VisitStatus];

export const CaseTreatmentStatus = {
  PLANNED: "PLANNED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
} as const;
export type CaseTreatmentStatus = (typeof CaseTreatmentStatus)[keyof typeof CaseTreatmentStatus];

/**
 * Timeline/audit event kinds for a Case, recorded by `CaseActivity`.
 *
 * This is how the brief's "make the workflow explicit" / "reconstruct the
 * case timeline" requirements are satisfied without cramming every stage
 * into `Case.status` (see the comment on `CaseStatus` above). Every
 * meaningful thing that happens to a case appends one of these rows,
 * server-side, in the same request that performs the action — so the
 * timeline is always consistent with the data, never reconstructed after
 * the fact from guesswork.
 */
export const CaseActivityType = {
  CASE_CREATED: "CASE_CREATED",
  STATUS_CHANGED: "STATUS_CHANGED",
  VISIT_SCHEDULED: "VISIT_SCHEDULED",
  VISIT_RESCHEDULED: "VISIT_RESCHEDULED",
  VISIT_CANCELLED: "VISIT_CANCELLED",
  VISIT_STARTED: "VISIT_STARTED",
  VISIT_COMPLETED: "VISIT_COMPLETED",
  INSPECTION_RECORDED: "INSPECTION_RECORDED",
  PHOTO_ADDED: "PHOTO_ADDED",
  TREATMENT_ADDED: "TREATMENT_ADDED",
  TREATMENT_UPDATED: "TREATMENT_UPDATED",
  TREATMENT_REMOVED: "TREATMENT_REMOVED",
  WORKER_ASSIGNED: "WORKER_ASSIGNED",
  CASE_RESOLVED: "CASE_RESOLVED",
  CASE_CANCELLED: "CASE_CANCELLED",
} as const;
export type CaseActivityType = (typeof CaseActivityType)[keyof typeof CaseActivityType];
