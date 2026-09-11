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

/**
 * Socket.IO event names — the full realtime contract (session 5 rewrite:
 * see CONTEXT.md "Event architecture").
 *
 * Deliberately **not** one generic "something changed" event. Every
 * meaningful thing that can happen to a case/visit gets its own event
 * name, so a client can decide precisely what to refetch instead of
 * re-pulling everything on every change. `CASE_UPDATED`/`VISIT_UPDATED`
 * still exist as the honest catch-all for edits that don't fit a more
 * specific bucket (e.g. an admin editing a case's problem description, or
 * rescheduling a visit's time/notes) — they are not used as a substitute
 * for the specific events below when a more specific one applies.
 *
 * Room design (server-side, see apps/server/src/realtime/socket.ts)
 * unchanged from session 3: every connected socket joins a global
 * `"cases"` room (Socket.IO isn't authenticated yet, so there's no
 * per-user room to scope to — see CONTEXT.md "Realtime design" for why
 * that's an accepted, documented gap) plus an opt-in `case:${caseId}`
 * room while a case detail screen is open. Every event below broadcasts
 * to both — the payload's ids are what let a client decide whether it
 * cares, not room membership alone.
 */
export const SOCKET_EVENTS = {
  /** Room housekeeping (client -> server) */
  JOIN_CASE_ROOM: "case:join",
  LEAVE_CASE_ROOM: "case:leave",

  // --- Case lifecycle ----------------------------------------------
  /** A case was created via manual intake. Payload: CaseEventPayload */
  CASE_CREATED: "case:created",
  /** Catch-all for a case edit that isn't a status change (e.g.
   * problemDescription/priority). Payload: CaseEventPayload */
  CASE_UPDATED: "case:updated",
  /** `Case.status` changed — either automatically (recalculated from
   * visit history) or via an explicit admin action. Fires alongside
   * CASE_RESOLVED when the new status is RESOLVED. Payload:
   * CaseStatusChangedPayload */
  CASE_STATUS_CHANGED: "case:status_changed",
  /** A case was explicitly marked resolved (a narrower, easy-to-listen-
   * for special case of CASE_STATUS_CHANGED). Payload: CaseEventPayload */
  CASE_RESOLVED: "case:resolved",

  // --- Visit lifecycle -----------------------------------------------
  /** A new visit was scheduled on a case. Payload: VisitEventPayload */
  VISIT_CREATED: "visit:created",
  /** Catch-all for a visit edit that isn't one of the more specific
   * events below (reschedule, notes, cancel). Payload: VisitEventPayload */
  VISIT_UPDATED: "visit:updated",
  /** A visit's assigned worker was set/changed (at creation or via a
   * later reassignment) — the event a worker's device specifically
   * listens for to learn "you have a new visit". Payload:
   * VisitAssignedPayload */
  VISIT_ASSIGNED: "visit:assigned",
  /** A worker tapped "Start visit". Payload: VisitEventPayload */
  VISIT_STARTED: "visit:started",
  /** A worker tapped "Complete visit". Payload: VisitEventPayload */
  VISIT_COMPLETED: "visit:completed",

  // --- Inspection / photos --------------------------------------------
  /** An inspection was recorded/updated for a visit (standalone, or as
   * part of completing the visit). Payload: VisitEventPayload */
  INSPECTION_CREATED: "inspection:created",
  /** A photo was attached to a visit/case (metadata endpoint or a real
   * upload — same event either way). Payload: PhotoAddedPayload */
  PHOTO_ADDED: "photo:added",

  // --- Treatments ------------------------------------------------------
  /** A catalog treatment was assigned to a case. Payload:
   * TreatmentEventPayload */
  TREATMENT_ADDED: "treatment:added",
  /** A case-treatment's status/notes changed (e.g. marked performed).
   * Payload: TreatmentUpdatedPayload */
  TREATMENT_UPDATED: "treatment:updated",
  /** A treatment was removed from a case. Payload: TreatmentEventPayload */
  TREATMENT_REMOVED: "treatment:removed",
} as const;
export type SocketEvent = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];

// --- Event payload shapes --------------------------------------------
//
// Every payload carries the case id, and a visit/treatment id where
// relevant, per the brief's "use case IDs / visit IDs so clients can
// determine what needs refreshing" — never the full record (the payload
// is a change notification, not a data transport; the client's own
// authorized GET is always the source of truth for what the new state
// actually is, see CONTEXT.md "Data consistency rules").

export interface CaseEventPayload {
  caseId: string;
}

export interface CaseStatusChangedPayload {
  caseId: string;
  from: CaseStatus;
  to: CaseStatus;
}

export interface VisitEventPayload {
  caseId: string;
  visitId: string;
}

export interface VisitAssignedPayload {
  caseId: string;
  visitId: string;
  /** null if a visit was explicitly unassigned. */
  workerId: string | null;
}

export interface PhotoAddedPayload {
  caseId: string;
  visitId: string | null;
  photoId: string;
}

export interface TreatmentEventPayload {
  caseId: string;
  caseTreatmentId: string;
}

export interface TreatmentUpdatedPayload {
  caseId: string;
  caseTreatmentId: string;
  status: CaseTreatmentStatus;
}

/** Maps each event name to its exact payload shape — lets a typed
 * `socket.on(SOCKET_EVENTS.X, (payload: SocketEventPayloadMap[typeof
 * SOCKET_EVENTS.X]) => ...)` on either client catch a payload-shape
 * mismatch at compile time instead of at runtime. */
export interface SocketEventPayloadMap {
  [SOCKET_EVENTS.CASE_CREATED]: CaseEventPayload;
  [SOCKET_EVENTS.CASE_UPDATED]: CaseEventPayload;
  [SOCKET_EVENTS.CASE_STATUS_CHANGED]: CaseStatusChangedPayload;
  [SOCKET_EVENTS.CASE_RESOLVED]: CaseEventPayload;
  [SOCKET_EVENTS.VISIT_CREATED]: VisitEventPayload;
  [SOCKET_EVENTS.VISIT_UPDATED]: VisitEventPayload;
  [SOCKET_EVENTS.VISIT_ASSIGNED]: VisitAssignedPayload;
  [SOCKET_EVENTS.VISIT_STARTED]: VisitEventPayload;
  [SOCKET_EVENTS.VISIT_COMPLETED]: VisitEventPayload;
  [SOCKET_EVENTS.INSPECTION_CREATED]: VisitEventPayload;
  [SOCKET_EVENTS.PHOTO_ADDED]: PhotoAddedPayload;
  [SOCKET_EVENTS.TREATMENT_ADDED]: TreatmentEventPayload;
  [SOCKET_EVENTS.TREATMENT_UPDATED]: TreatmentUpdatedPayload;
  [SOCKET_EVENTS.TREATMENT_REMOVED]: TreatmentEventPayload;
}
