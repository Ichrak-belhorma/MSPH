import { useEffect, type ReactNode } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { SOCKET_EVENTS, type SocketEventPayloadMap } from "@msph/shared";
import { useAuth } from "../auth/AuthContext";
import { connectSocket, disconnectSocket } from "../lib/socket";
import { queryKeys } from "../api/queryKeys";

/**
 * Mirrors apps/desktop/src/realtime/RealtimeProvider.tsx — see
 * CONTEXT.md "Event architecture" (session 5). Listens to the full event
 * taxonomy and invalidates react-query caches; never patches the cache
 * from a socket payload (CONTEXT.md "Data consistency rules" — the
 * backend/database stays the single source of truth).
 *
 * This is the mobile side of Scenario 2/5 ("worker receives
 * VISIT_ASSIGNED... sees the new visit without manually refreshing"):
 * every event below invalidates `visits.all()`, which is exactly the
 * query `useMyVisitsQuery` (Home/Today screen) is built on — the server
 * already scopes that endpoint to the worker's own assigned visits (see
 * CONTEXT.md 3.15), so this file never needs to check "is this visit
 * mine" itself, it just asks for a refetch and the server's own
 * authorization decides what comes back.
 */

function invalidateCase(queryClient: QueryClient, caseId: string): void {
  void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
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

    // A case-level event (a manager editing problemDescription/priority,
    // or a treatment change) doesn't change *which* visits a worker has,
    // so it only needs to invalidate the visits list when the event is
    // one that could plausibly affect what "my visits today" should show
    // (assignment/creation) — everything else just refreshes the one
    // case detail screen, if it's open, via cases.detail(caseId).
    const onCaseOnly = (p: SocketEventPayloadMap[typeof SOCKET_EVENTS.CASE_UPDATED]) => invalidateCase(queryClient, p.caseId);
    const onVisit = (p: SocketEventPayloadMap[typeof SOCKET_EVENTS.VISIT_CREATED]) => invalidateVisit(queryClient, p.caseId, p.visitId);
    const onVisitAssigned = (p: SocketEventPayloadMap[typeof SOCKET_EVENTS.VISIT_ASSIGNED]) => invalidateVisit(queryClient, p.caseId, p.visitId);
    const onInspection = (p: SocketEventPayloadMap[typeof SOCKET_EVENTS.INSPECTION_CREATED]) => invalidateVisit(queryClient, p.caseId, p.visitId);
    const onPhoto = (p: SocketEventPayloadMap[typeof SOCKET_EVENTS.PHOTO_ADDED]) =>
      p.visitId ? invalidateVisit(queryClient, p.caseId, p.visitId) : invalidateCase(queryClient, p.caseId);
    const onTreatment = (p: SocketEventPayloadMap[typeof SOCKET_EVENTS.TREATMENT_ADDED]) => invalidateCase(queryClient, p.caseId);

    // --- Case lifecycle (relevant when a worker has that case's detail
    // screen open — treatments/instructions can change under them) -----
    socket.on(SOCKET_EVENTS.CASE_UPDATED, onCaseOnly);
    socket.on(SOCKET_EVENTS.CASE_STATUS_CHANGED, onCaseOnly);
    socket.on(SOCKET_EVENTS.CASE_RESOLVED, onCaseOnly);
    // --- Visit lifecycle — the ones that change "what are my visits" ---
    socket.on(SOCKET_EVENTS.VISIT_CREATED, onVisit);
    socket.on(SOCKET_EVENTS.VISIT_UPDATED, onVisit);
    socket.on(SOCKET_EVENTS.VISIT_ASSIGNED, onVisitAssigned);
    // VISIT_STARTED/VISIT_COMPLETED originate from this same worker's own
    // mutation in the overwhelming majority of cases (mobile has no
    // "someone else is on my visit" scenario), but listening anyway keeps
    // multi-device/admin-override cases (an admin marks a visit no-show
    // from the desktop) in sync too.
    socket.on(SOCKET_EVENTS.VISIT_STARTED, onVisit);
    socket.on(SOCKET_EVENTS.VISIT_COMPLETED, onVisit);
    // --- Inspection / photos / treatments — case detail (Visit Detail's
    // "assigned treatments" / "previous visits" sections) -----------------
    socket.on(SOCKET_EVENTS.INSPECTION_CREATED, onInspection);
    socket.on(SOCKET_EVENTS.PHOTO_ADDED, onPhoto);
    socket.on(SOCKET_EVENTS.TREATMENT_ADDED, onTreatment);
    socket.on(SOCKET_EVENTS.TREATMENT_UPDATED, onTreatment);
    socket.on(SOCKET_EVENTS.TREATMENT_REMOVED, onTreatment);

    return () => {
      socket.off(SOCKET_EVENTS.CASE_UPDATED, onCaseOnly);
      socket.off(SOCKET_EVENTS.CASE_STATUS_CHANGED, onCaseOnly);
      socket.off(SOCKET_EVENTS.CASE_RESOLVED, onCaseOnly);
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
    if (!isAuthenticated) disconnectSocket();
  }, [isAuthenticated]);

  return <>{children}</>;
}
