import type { User } from "@msph/shared";

/**
 * Session state lives here, outside React, so the API client (a plain
 * module, not a component) can read the current access token and update
 * it after a silent refresh without importing React or going through
 * context. `src/auth/AuthContext.tsx` is a thin reactive wrapper around
 * this store (via `useSyncExternalStore`) for components that need to
 * render based on auth state (route guards, the user menu, ...).
 *
 * The refresh token never leaves this module except to be written to/
 * read from Electron's encrypted secure storage (see
 * electron/secureStorage.cts) — it's kept in memory here, not
 * localStorage, precisely so a XSS-style renderer compromise reading
 * `localStorage` doesn't hand over a long-lived credential.
 */

export interface Session {
  accessToken: string;
  user: User;
}

type Listener = () => void;

let session: Session | null = null;
let refreshToken: string | null = null;
const listeners = new Set<Listener>();

export function getSession(): Session | null {
  return session;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

export function setSession(nextSession: Session, nextRefreshToken: string): void {
  session = nextSession;
  refreshToken = nextRefreshToken;
  notify();
}

/** After a silent refresh: new tokens, same user unless a fresher one is given. */
export function updateTokens(accessToken: string, nextRefreshToken: string): void {
  if (!session) return;
  session = { ...session, accessToken };
  refreshToken = nextRefreshToken;
  notify();
}

export function updateUser(user: User): void {
  if (!session) return;
  session = { ...session, user };
  notify();
}

export function clearSession(): void {
  session = null;
  refreshToken = null;
  notify();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(): void {
  for (const listener of listeners) listener();
}
