import { io, type Socket } from "socket.io-client";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ?? API_BASE_URL.replace(/\/api\/?$/, "");

let socket: Socket | null = null;

/**
 * One shared connection for the whole app, created on login and torn
 * down on logout (see realtime/RealtimeProvider.tsx) — there's no
 * per-screen connect/disconnect, only per-screen room membership
 * (see useCaseRoom.ts).
 *
 * Not authenticated: the server accepts any connection (see
 * apps/server/src/realtime/socket.ts) — Socket.IO auth was out of scope
 * for the backend session that built this, so there's nothing for the
 * client to send here yet. Noted as a gap, not pretended away.
 */
export function connectSocket(): Socket {
  socket ??= io(SOCKET_URL, { autoConnect: true, reconnection: true });
  return socket;
}

export function disconnectSocket(): void {
  socket?.disconnect();
  socket = null;
}

export function getSocket(): Socket | null {
  return socket;
}
