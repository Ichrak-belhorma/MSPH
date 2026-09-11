import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { CaseStatus, SOCKET_EVENTS } from "@msph/shared";
import type {
  CaseStatusChangedPayload,
  CaseTreatmentStatus,
  PhotoAddedPayload,
  TreatmentUpdatedPayload,
  VisitAssignedPayload,
} from "@msph/shared";
import { clientOrigins } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Realtime layer — see CONTEXT.md "Event architecture" (session 5) for
 * the full design rationale. Room design unchanged since session 3: a
 * global `cases` room every socket joins on connect (Socket.IO isn't
 * authenticated yet — see the doc comment on `initSocket`'s connection
 * handler below — so there's no per-user room to scope to), plus an
 * opt-in `case:${caseId}` room while a case detail screen is open.
 *
 * What *did* change this session: instead of four generic events
 * (case/visit created/updated), every route now emits the most specific
 * event that describes what actually happened — see `SOCKET_EVENTS` in
 * packages/shared/src/constants/index.ts for the full taxonomy and each
 * event's payload shape. Every emit helper below takes only ids (+ the
 * small bit of metadata a client needs to decide relevance, e.g. a
 * status change's `from`/`to`) — never the full record. The client's own
 * authorized GET is always the source of truth for what the new state
 * actually is; a socket event is a *hint to refetch*, not a data feed.
 */
let io: SocketIOServer | undefined;

const CASES_ROOM = "cases";
const caseRoom = (caseId: string) => `case:${caseId}`;

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: clientOrigins, credentials: true },
  });

  io.on("connection", (socket) => {
    logger.debug("Socket connected", { socketId: socket.id });

    // Every connected client gets list/dashboard-level updates — there's
    // no per-user filtering to do here (Socket.IO connections aren't
    // authenticated yet, see CONTEXT.md "Realtime design" — a documented
    // gap, not an oversight: payloads never carry anything beyond ids,
    // and every client's own REST refetch is authorized/scoped
    // server-side regardless of which events it happened to receive), and
    // any screen that's open wants to know a case changed. Case-*detail*-
    // level updates are still opt-in per case via JOIN_CASE_ROOM below,
    // so a client watching one case doesn't need to filter a firehose of
    // unrelated visit events.
    socket.join(CASES_ROOM);

    socket.on(SOCKET_EVENTS.JOIN_CASE_ROOM, (caseId: string) => {
      socket.join(caseRoom(caseId));
    });

    socket.on(SOCKET_EVENTS.LEAVE_CASE_ROOM, (caseId: string) => {
      socket.leave(caseRoom(caseId));
    });

    socket.on("disconnect", () => {
      logger.debug("Socket disconnected", { socketId: socket.id });
    });
  });

  return io;
}

export function getIO(): SocketIOServer | undefined {
  return io;
}

/** Broadcasts one event to both rooms a client could be listening on for
 * it — the global list/dashboard room and (if relevant) the specific
 * case's detail room. Every emit helper below is a thin, named wrapper
 * around this so call sites read as "what happened", not "which rooms". */
function broadcast<T>(event: string, caseId: string, payload: T): void {
  io?.to(CASES_ROOM).emit(event, payload);
  io?.to(caseRoom(caseId)).emit(event, payload);
}

/** All emit helpers no-op quietly if the socket server hasn't been
 * initialized (e.g. in tests that build the Express app directly without
 * booting an HTTP+Socket.IO server) — realtime is a nice-to-have, an
 * HTTP request must never fail because of it. */

// --- Case lifecycle ------------------------------------------------

export function emitCaseCreated(caseId: string): void {
  broadcast(SOCKET_EVENTS.CASE_CREATED, caseId, { caseId });
}

/** Catch-all for a case edit that isn't a status change — see
 * emitCaseStatusChanged for that. */
export function emitCaseUpdated(caseId: string): void {
  broadcast(SOCKET_EVENTS.CASE_UPDATED, caseId, { caseId });
}

/** Emits CASE_STATUS_CHANGED, and CASE_RESOLVED too when the new status
 * is RESOLVED — a narrower, purpose-named event some listeners (e.g. a
 * "resolved today" tile) can subscribe to directly instead of checking
 * `to === "RESOLVED"` on every status-change payload themselves. */
export function emitCaseStatusChanged(caseId: string, from: CaseStatus, to: CaseStatus): void {
  const payload: CaseStatusChangedPayload = { caseId, from, to };
  broadcast(SOCKET_EVENTS.CASE_STATUS_CHANGED, caseId, payload);
  if (to === CaseStatus.RESOLVED) {
    broadcast(SOCKET_EVENTS.CASE_RESOLVED, caseId, { caseId });
  }
}

// --- Visit lifecycle -------------------------------------------------

export function emitVisitCreated(caseId: string, visitId: string): void {
  broadcast(SOCKET_EVENTS.VISIT_CREATED, caseId, { caseId, visitId });
}

/** Catch-all for a visit edit that isn't one of the more specific events
 * below (reschedule, notes, cancel/no-show). */
export function emitVisitUpdated(caseId: string, visitId: string): void {
  broadcast(SOCKET_EVENTS.VISIT_UPDATED, caseId, { caseId, visitId });
}

export function emitVisitAssigned(caseId: string, visitId: string, workerId: string | null): void {
  const payload: VisitAssignedPayload = { caseId, visitId, workerId };
  broadcast(SOCKET_EVENTS.VISIT_ASSIGNED, caseId, payload);
}

export function emitVisitStarted(caseId: string, visitId: string): void {
  broadcast(SOCKET_EVENTS.VISIT_STARTED, caseId, { caseId, visitId });
}

export function emitVisitCompleted(caseId: string, visitId: string): void {
  broadcast(SOCKET_EVENTS.VISIT_COMPLETED, caseId, { caseId, visitId });
}

// --- Inspection / photos -----------------------------------------------

export function emitInspectionCreated(caseId: string, visitId: string): void {
  broadcast(SOCKET_EVENTS.INSPECTION_CREATED, caseId, { caseId, visitId });
}

export function emitPhotoAdded(caseId: string, visitId: string | null, photoId: string): void {
  const payload: PhotoAddedPayload = { caseId, visitId, photoId };
  broadcast(SOCKET_EVENTS.PHOTO_ADDED, caseId, payload);
}

// --- Treatments ----------------------------------------------------------

export function emitTreatmentAdded(caseId: string, caseTreatmentId: string): void {
  broadcast(SOCKET_EVENTS.TREATMENT_ADDED, caseId, { caseId, caseTreatmentId });
}

export function emitTreatmentUpdated(caseId: string, caseTreatmentId: string, status: CaseTreatmentStatus): void {
  const payload: TreatmentUpdatedPayload = { caseId, caseTreatmentId, status };
  broadcast(SOCKET_EVENTS.TREATMENT_UPDATED, caseId, payload);
}

export function emitTreatmentRemoved(caseId: string, caseTreatmentId: string): void {
  broadcast(SOCKET_EVENTS.TREATMENT_REMOVED, caseId, { caseId, caseTreatmentId });
}
