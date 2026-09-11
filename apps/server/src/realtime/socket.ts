import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import { SOCKET_EVENTS } from "@msph/shared";
import { env } from "../config/env.js";
import { logger } from "../lib/logger.js";

/**
 * Realtime layer skeleton.
 *
 * Deliberately minimal for now (per the foundation-first build order):
 * clients can connect and join per-case rooms, but no domain events are
 * emitted yet — that lands alongside the case/visit routes that produce
 * them. Broadcasting helpers live here so route handlers call
 * `emitCaseUpdated(caseId)` etc. instead of reaching into `io` directly,
 * which is what keeps the event set small and deliberate as described in
 * CONTEXT.md "Realtime design".
 */
let io: SocketIOServer | undefined;

export function initSocket(httpServer: HttpServer): SocketIOServer {
  io = new SocketIOServer(httpServer, {
    cors: { origin: env.CLIENT_ORIGIN, credentials: true },
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

export function getIO(): SocketIOServer {
  if (!io) {
    throw new Error("Socket.IO server accessed before initSocket() was called");
  }
  return io;
}
