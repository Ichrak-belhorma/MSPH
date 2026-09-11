import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { SOCKET_EVENTS } from "@msph/shared";
import { clientOrigins } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Realtime layer.
 *
 * Transport + room housekeeping only lived here through session 1; this
 * session wires the actual emits from the cases/visits routes via the
 * helpers below, kept deliberately narrow per CONTEXT.md "Realtime
 * design": a global `cases` room for list/dashboard-level changes, and a
 * `case:${caseId}` room per case detail screen so clients don't receive
 * updates for cases they're not looking at.
 */
let io: SocketIOServer | undefined;

const CASES_ROOM = "cases";

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: clientOrigins, credentials: true },
  });

  io.on("connection", (socket) => {
    logger.debug("Socket connected", { socketId: socket.id });

    socket.on(SOCKET_EVENTS.JOIN_CASE_ROOM, (caseId: string) => {
      socket.join(`case:${caseId}`);
    });

    socket.on(SOCKET_EVENTS.LEAVE_CASE_ROOM, (caseId: string) => {
      socket.leave(`case:${caseId}`);
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

/** All emit helpers no-op quietly if the socket server hasn't been
 * initialized (e.g. in tests, which build the Express app directly without
 * booting an HTTP+Socket.IO server) — realtime is a nice-to-have, an
 * HTTP request must never fail because of it. */

export function emitCaseCreated(caseId: string): void {
  io?.to(CASES_ROOM).emit(SOCKET_EVENTS.CASE_CREATED, { caseId });
}

export function emitCaseUpdated(caseId: string): void {
  io?.to(CASES_ROOM).emit(SOCKET_EVENTS.CASE_UPDATED, { caseId });
  io?.to(`case:${caseId}`).emit(SOCKET_EVENTS.CASE_UPDATED, { caseId });
}

export function emitVisitCreated(caseId: string, visitId: string): void {
  io?.to(`case:${caseId}`).emit(SOCKET_EVENTS.VISIT_CREATED, { caseId, visitId });
  io?.to(CASES_ROOM).emit(SOCKET_EVENTS.CASE_UPDATED, { caseId });
}

export function emitVisitUpdated(caseId: string, visitId: string): void {
  io?.to(`case:${caseId}`).emit(SOCKET_EVENTS.VISIT_UPDATED, { caseId, visitId });
  io?.to(CASES_ROOM).emit(SOCKET_EVENTS.CASE_UPDATED, { caseId });
}
