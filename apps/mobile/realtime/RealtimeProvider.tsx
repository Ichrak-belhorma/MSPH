import { useEffect, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { SOCKET_EVENTS } from "@msph/shared";
import { useAuth } from "../auth/AuthContext";
import { connectSocket, disconnectSocket } from "../lib/socket";
import { queryKeys } from "../api/queryKeys";

/**
 * Mirrors apps/desktop/src/realtime/RealtimeProvider.tsx — see CONTEXT.md
 * "Realtime design". This is the mobile side of "when a manager assigns a
 * visit, reschedules a visit, or changes relevant case information, the
 * mobile app should eventually receive updates" (brief): every socket
 * connection already receives CASE_CREATED/CASE_UPDATED/VISIT_CREATED/
 * VISIT_UPDATED broadcasts (the server doesn't filter by user — see
 * apps/server/src/realtime/socket.ts and CONTEXT.md 3.12), so on any of
 * those events this just invalidates the visits list/detail queries;
 * react-query refetches `GET /visits`, which the server *does* filter to
 * the worker's own assigned visits — so a worker only ever actually sees
 * updates relevant to them, enforced server-side, not by filtering
 * events client-side.
 */
export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuth();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!isAuthenticated) return;

    const socket = connectSocket();

    const onChanged = (payload: { caseId: string; visitId?: string }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.visits.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(payload.caseId) });
      if (payload.visitId) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.visits.detail(payload.visitId) });
      }
    };

    socket.on(SOCKET_EVENTS.CASE_CREATED, onChanged);
    socket.on(SOCKET_EVENTS.CASE_UPDATED, onChanged);
    socket.on(SOCKET_EVENTS.VISIT_CREATED, onChanged);
    socket.on(SOCKET_EVENTS.VISIT_UPDATED, onChanged);

    return () => {
      socket.off(SOCKET_EVENTS.CASE_CREATED, onChanged);
      socket.off(SOCKET_EVENTS.CASE_UPDATED, onChanged);
      socket.off(SOCKET_EVENTS.VISIT_CREATED, onChanged);
      socket.off(SOCKET_EVENTS.VISIT_UPDATED, onChanged);
    };
  }, [isAuthenticated, queryClient]);

  useEffect(() => {
    if (!isAuthenticated) disconnectSocket();
  }, [isAuthenticated]);

  return <>{children}</>;
}
