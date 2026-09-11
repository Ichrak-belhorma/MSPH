import { CaseActivityType, CasePriority, CaseStatus, CaseTreatmentStatus, UserRole, VisitStatus, VisitType } from "../enums.js";

/** Human-readable labels for UI — kept here so desktop and mobile never
 * disagree on wording. */
export const CASE_STATUS_LABELS: Record<CaseStatus, string> = {
  [CaseStatus.NEW]: "New",
  [CaseStatus.SCHEDULED]: "Scheduled",
  [CaseStatus.IN_PROGRESS]: "In Progress",
  [CaseStatus.RESOLVED]: "Resolved",
  [CaseStatus.CANCELLED]: "Cancelled",
};

export const CASE_PRIORITY_LABELS: Record<CasePriority, string> = {
  [CasePriority.LOW]: "Low",
  [CasePriority.MEDIUM]: "Medium",
  [CasePriority.HIGH]: "High",
  [CasePriority.URGENT]: "Urgent",
};

export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  [VisitType.INITIAL_INSPECTION]: "Initial Inspection",
  [VisitType.TREATMENT]: "Treatment",
  [VisitType.FOLLOW_UP]: "Follow-up",
  [VisitType.OTHER]: "Other",
};

export const VISIT_STATUS_LABELS: Record<VisitStatus, string> = {
  [VisitStatus.SCHEDULED]: "Scheduled",
  [VisitStatus.IN_PROGRESS]: "In Progress",
  [VisitStatus.COMPLETED]: "Completed",
  [VisitStatus.CANCELLED]: "Cancelled",
  [VisitStatus.NO_SHOW]: "No-show",
};

export const CASE_TREATMENT_STATUS_LABELS: Record<CaseTreatmentStatus, string> = {
  [CaseTreatmentStatus.PLANNED]: "Planned",
  [CaseTreatmentStatus.COMPLETED]: "Completed",
  [CaseTreatmentStatus.CANCELLED]: "Cancelled",
};

export const USER_ROLE_LABELS: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Admin",
  [UserRole.WORKER]: "Worker",
};

export const CASE_ACTIVITY_TYPE_LABELS: Record<CaseActivityType, string> = {
  [CaseActivityType.CASE_CREATED]: "Case created",
  [CaseActivityType.STATUS_CHANGED]: "Status changed",
  [CaseActivityType.VISIT_SCHEDULED]: "Visit scheduled",
  [CaseActivityType.VISIT_RESCHEDULED]: "Visit rescheduled",
  [CaseActivityType.VISIT_CANCELLED]: "Visit cancelled",
  [CaseActivityType.VISIT_STARTED]: "Visit started",
  [CaseActivityType.VISIT_COMPLETED]: "Visit completed",
  [CaseActivityType.INSPECTION_RECORDED]: "Inspection recorded",
  [CaseActivityType.PHOTO_ADDED]: "Photo added",
  [CaseActivityType.TREATMENT_ADDED]: "Treatment added",
  [CaseActivityType.TREATMENT_UPDATED]: "Treatment updated",
  [CaseActivityType.TREATMENT_REMOVED]: "Treatment removed",
  [CaseActivityType.WORKER_ASSIGNED]: "Worker assigned",
  [CaseActivityType.CASE_RESOLVED]: "Case resolved",
  [CaseActivityType.CASE_CANCELLED]: "Case cancelled",
};

/** CaseStatus values that mean "nothing left to do". */
export const TERMINAL_CASE_STATUSES: readonly CaseStatus[] = [CaseStatus.RESOLVED, CaseStatus.CANCELLED];

/** Default page size for list endpoints, mirrored in validation/common.ts. */
export const DEFAULT_PAGE_SIZE = 25;

/** Socket.IO event names — the full realtime contract. Keep this list
 * deliberately small (see CONTEXT.md "Realtime design"): clients join
 * per-case and a global "cases" room rather than receiving every event
 * unfiltered. */
export const SOCKET_EVENTS = {
  /** Room housekeeping (client -> server) */
  JOIN_CASE_ROOM: "case:join",
  LEAVE_CASE_ROOM: "case:leave",

  /** Broadcast to the "cases" room: list/dashboard screens re-fetch or
   * patch the affected case. Payload: { caseId: string } */
  CASE_UPDATED: "case:updated",
  /** Broadcast to the "cases" room when a case is created from intake.
   * Payload: { caseId: string } */
  CASE_CREATED: "case:created",

  /** Broadcast to room `case:${caseId}`. Payload: { caseId, visitId } */
  VISIT_UPDATED: "visit:updated",
  VISIT_CREATED: "visit:created",
} as const;
export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
