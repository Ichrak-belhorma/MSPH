import type { User } from "@msph/shared";

/**
 * Session state outside React — same pattern as
 * apps/desktop/src/lib/authStore.ts (see CONTEXT.md). `auth/AuthContext.tsx`
 * is a reactive wrapper around this via `useSyncExternalStore`.
 *
 * The refresh token is kept here in memory and mirrored to
 * `expo-secure-store` (OS keychain/keystore, see lib/secureStorage.ts) —
 * never AsyncStorage, which is unencrypted on-device storage and the
 * wrong place for a long-lived credential (see CONTEXT.md "Next steps"
 * from the desktop session, carried over as a deliberate choice here too).
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

export function updateTokens(accessToken: string, nextRefreshToken: string): void {
  if (!session) return;
  session = { ...session, accessToken };
  refreshToken = nextRefreshToken;
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
