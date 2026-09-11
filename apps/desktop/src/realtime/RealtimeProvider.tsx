import { useEffect, type ReactNode } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { SOCKET_EVENTS, type SocketEventPayloadMap } from "@msph/shared";
import { useAuth } from "../auth/AuthContext.js";
import { connectSocket, disconnectSocket } from "../lib/socket.js";
import { queryKeys } from "../api/queryKeys.js";

/**
 * Mounted once, near the app root (inside AuthProvider). Connects the
 * shared socket while a session is active and wires the full event
 * taxonomy (see CONTEXT.md "Event architecture", session 5) to
 * react-query cache invalidation.
 *
 * **Synchronization rule** (CONTEXT.md "Data consistency rules"): this
 * *never* patches the cache by hand from a socket payload. Every payload
 * is intentionally minimal (an id, maybe a status) — the backend/database
 * stays the single source of truth, and the client's own authorized GET
 * is the only thing allowed to decide what the new state actually is.
 * A socket event is a prompt to refetch, never a data transport.
 *
 * Every specific event (VISIT_STARTED, TREATMENT_ADDED, ...) still maps
 * to the same couple of invalidations a generic "something changed"
 * event would — the desktop's `GET /cases/:id` already returns the case
 * with its visits/photos/treatments/activities all embedded (see
 * `CaseWithRelations`), so *which* specific event fired doesn't change
 * *what* gets refetched, only *when a listener bothers to*. The value of
 * the granular taxonomy is at the emit side (a client can filter/react
 * to specific event types if it ever needs to — e.g. a future toast on
 * CASE_RESOLVED) and in the server-level test suite that pins the exact
 * contract (apps/server/tests/realtime.test.ts) — not in this file
 * needing different invalidation logic per event today.
 */

function invalidateCase(queryClient: QueryClient, caseId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.cases.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
  void queryClient.invalidateQueries({ queryKey: queryKeys.cases.timeline(caseId) });
}

function invalidateVisit(queryClient: QueryClient, caseId: string, visitId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.visits.all() });
  void queryClient.invalidateQueries({ queryKey: queryKeys.visits.detail(visitId) });
  invalidateCase(queryClient, caseId);
}

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = connectSocket();

    const onCase = (p: SocketEventPayloadMap[typeof SOCKET_EVENTS.CASE_CREATED]) => invalidateCase(queryClient, p.caseId);
    const onCaseStatusChanged = (p: SocketEventPayloadMap[typeof SOCKET_EVENTS.CASE_STATUS_CHANGED]) => invalidateCase(queryClient, p.caseId);
    const onVisit = (p: SocketEventPayloadMap[typeof SOCKET_EVENTS.VISIT_CREATED]) => invalidateVisit(queryClient, p.caseId, p.visitId);
    const onVisitAssigned = (p: SocketEventPayloadMap[typeof SOCKET_EVENTS.VISIT_ASSIGNED]) => invalidateVisit(queryClient, p.caseId, p.visitId);
    const onInspection = (p: SocketEventPayloadMap[typeof SOCKET_EVENTS.INSPECTION_CREATED]) => invalidateVisit(queryClient, p.caseId, p.visitId);
    const onPhoto = (p: SocketEventPayloadMap[typeof SOCKET_EVENTS.PHOTO_ADDED]) =>
      p.visitId ? invalidateVisit(queryClient, p.caseId, p.visitId) : invalidateCase(queryClient, p.caseId);
    const onTreatment = (p: SocketEventPayloadMap[typeof SOCKET_EVENTS.TREATMENT_ADDED]) => invalidateCase(queryClient, p.caseId);

    // --- Case lifecycle ------------------------------------------------
    socket.on(SOCKET_EVENTS.CASE_CREATED, onCase);
    socket.on(SOCKET_EVENTS.CASE_UPDATED, onCase);
    socket.on(SOCKET_EVENTS.CASE_STATUS_CHANGED, onCaseStatusChanged);
    socket.on(SOCKET_EVENTS.CASE_RESOLVED, onCase);
    // --- Visit lifecycle -------------------------------------------------
    socket.on(SOCKET_EVENTS.VISIT_CREATED, onVisit);
    socket.on(SOCKET_EVENTS.VISIT_UPDATED, onVisit);
    socket.on(SOCKET_EVENTS.VISIT_ASSIGNED, onVisitAssigned);
    socket.on(SOCKET_EVENTS.VISIT_STARTED, onVisit);
    socket.on(SOCKET_EVENTS.VISIT_COMPLETED, onVisit);
    // --- Inspection / photos ---------------------------------------------
    socket.on(SOCKET_EVENTS.INSPECTION_CREATED, onInspection);
    socket.on(SOCKET_EVENTS.PHOTO_ADDED, onPhoto);
    // --- Treatments ------------------------------------------------------
    socket.on(SOCKET_EVENTS.TREATMENT_ADDED, onTreatment);
    socket.on(SOCKET_EVENTS.TREATMENT_UPDATED, onTreatment);
    socket.on(SOCKET_EVENTS.TREATMENT_REMOVED, onTreatment);

    return () => {
      socket.off(SOCKET_EVENTS.CASE_CREATED, onCase);
      socket.off(SOCKET_EVENTS.CASE_UPDATED, onCase);
      socket.off(SOCKET_EVENTS.CASE_STATUS_CHANGED, onCaseStatusChanged);
      socket.off(SOCKET_EVENTS.CASE_RESOLVED, onCase);
      socket.off(SOCKET_EVENTS.VISIT_CREATED, onVisit);
      socket.off(SOCKET_EVENTS.VISIT_UPDATED, onVisit);
      socket.off(SOCKET_EVENTS.VISIT_ASSIGNED, onVisitAssigned);
      socket.off(SOCKET_EVENTS.VISIT_STARTED, onVisit);
      socket.off(SOCKET_EVENTS.VISIT_COMPLETED, onVisit);
      socket.off(SOCKET_EVENTS.INSPECTION_CREATED, onInspection);
      socket.off(SOCKET_EVENTS.PHOTO_ADDED, onPhoto);
      socket.off(SOCKET_EVENTS.TREATMENT_ADDED, onTreatment);
      socket.off(SOCKET_EVENTS.TREATMENT_UPDATED, onTreatment);
      socket.off(SOCKET_EVENTS.TREATMENT_REMOVED, onTreatment);
    };
  }, [isAuthenticated, queryClient]);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
    }
  }, [isAuthenticated]);

  return <>{children}</>;
}
