/**
 * Thin wrapper over the `window.msph.secureStorage` bridge exposed by
 * electron/preload.cts. Falls back to `sessionStorage` when running
 * outside Electron (e.g. `vite preview` in a plain browser tab during
 * development) so the app doesn't hard-crash there — real usage is
 * always inside Electron, where the encrypted bridge is present.
 */
const REFRESH_TOKEN_KEY = "msph.refreshToken";

function hasBridge(): boolean {
  return typeof window !== "undefined" && window.msph !== undefined;
}

export async function loadRefreshToken(): Promise<string | null> {
  if (hasBridge()) return window.msph!.secureStorage.get(REFRESH_TOKEN_KEY);
  return sessionStorage.getItem(REFRESH_TOKEN_KEY);
}

export async function saveRefreshToken(token: string): Promise<void> {
  if (hasBridge()) return window.msph!.secureStorage.set(REFRESH_TOKEN_KEY, token);
  sessionStorage.setItem(REFRESH_TOKEN_KEY, token);
}

export async function clearRefreshToken(): Promise<void> {
  if (hasBridge()) return window.msph!.secureStorage.delete(REFRESH_TOKEN_KEY);
  sessionStorage.removeItem(REFRESH_TOKEN_KEY);
}
