import { io, type Socket } from "socket.io-client";
import { API_BASE_URL } from "./apiClient";

const SOCKET_URL = process.env.EXPO_PUBLIC_SOCKET_URL ?? API_BASE_URL.replace(/\/api\/?$/, "");

let socket: Socket | null = null;

/**
 * One shared connection, created on login and torn down on logout — same
 * pattern as apps/desktop/src/lib/socket.ts. Not authenticated (the
 * server accepts any connection, see CONTEXT.md "Realtime" — a gap noted
 * there, not specific to mobile).
 */
export function connectSocket(): Socket {
  socket ??= io(SOCKET_URL, { autoConnect: true, reconnection: true });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}
