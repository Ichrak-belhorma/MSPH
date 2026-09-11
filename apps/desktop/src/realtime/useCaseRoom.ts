import { useEffect } from "react";
import { SOCKET_EVENTS } from "@msph/shared";
import { getSocket } from "../lib/socket.js";

/** Joins `case:${caseId}` while the case detail screen is mounted, so
 * this specific case's visit-level events reach it even though the
 * global RealtimeProvider only auto-joins the list-level `cases` room.
 * Leaves the room on unmount — nothing keeps listening once the manager
 * navigates away. */
export function useCaseRoom(caseId: string | undefined): void {
  useEffect(() => {
    if (!caseId) return;
    const socket = getSocket();
    if (!socket) return;

    socket.emit(SOCKET_EVENTS.JOIN_CASE_ROOM, caseId);
    return () => {
      socket.emit(SOCKET_EVENTS.LEAVE_CASE_ROOM, caseId);
    };
  }, [caseId]);
}
