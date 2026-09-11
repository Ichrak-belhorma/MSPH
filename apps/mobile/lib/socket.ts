import { io, type Socket } from "socket.io-client";
import { getSocketUrl } from "./config";

let socket: Socket | null = null;

/**
 * One shared connection, created on login and torn down on logout — same
 * pattern as apps/desktop/src/lib/socket.ts. Not authenticated (the
 * server accepts any connection, see CONTEXT.md "Realtime" — a gap noted
 * there, not specific to mobile).
 */
export function connectSocket(): Socket {
  socket ??= io(getSocketUrl(), { autoConnect: true, reconnection: true });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
