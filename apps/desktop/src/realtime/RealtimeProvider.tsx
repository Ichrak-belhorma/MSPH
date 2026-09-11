import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SOCKET_EVENTS } from "@msph/shared";
import { useAuth } from "../auth/AuthContext.js";
import { connectSocket, disconnectSocket } from "../lib/socket.js";
import { queryKeys } from "../api/queryKeys.js";

/**
 * Mounted once, near the root, inside AuthProvider. Connects the shared
 * socket while a session is active and wires the small, deliberate event
 * set (see CONTEXT.md "Realtime design") to react-query cache
 * invalidation — this is the "worker completes an inspection on mobile
 * -> desktop updates without a full reload" path from the task brief.
 *
 * Invalidating (refetch-if-observed) rather than patching the cache by
 * hand: the payloads are intentionally minimal ({caseId} /
 * {caseId, visitId}), so the source of truth for what actually changed
 * is always a real GET, never a guess reconstructed from a socket event.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = connectSocket();

    const onCaseChanged = (payload: { caseId: string }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(payload.caseId) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.timeline(payload.caseId) });
    };
    const onVisitChanged = (payload: { caseId: string; visitId: string }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.visits.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.visits.detail(payload.visitId) });
      onCaseChanged(payload);
    };

    socket.on(SOCKET_EVENTS.CASE_CREATED, onCaseChanged);
    socket.on(SOCKET_EVENTS.CASE_UPDATED, onCaseChanged);
    socket.on(SOCKET_EVENTS.VISIT_CREATED, onVisitChanged);
    socket.on(SOCKET_EVENTS.VISIT_UPDATED, onVisitChanged);

    return () => {
      socket.off(SOCKET_EVENTS.CASE_CREATED, onCaseChanged);
      socket.off(SOCKET_EVENTS.CASE_UPDATED, onCaseChanged);
      socket.off(SOCKET_EVENTS.VISIT_CREATED, onVisitChanged);
      socket.off(SOCKET_EVENTS.VISIT_UPDATED, onVisitChanged);
    };
  }, [isAuthenticated, queryClient]);

  useEffect(() => {
    if (!isAuthenticated) {
      disconnectSocket();
    }
  }, [isAuthenticated]);

  return <>{children}</>;
}
