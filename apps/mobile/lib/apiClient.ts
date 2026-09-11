import type { ApiErrorBody } from "@msph/shared";
import { clearSession, getRefreshToken, getSession, updateTokens } from "./authStore";

/**
 * `EXPO_PUBLIC_API_BASE_URL` must point at a host reachable from the
 * device/emulator, not `localhost` (see the old lib/api.ts's doc comment,
 * now folded into this file — it superseded the health-check-only
 * wrapper: everything authenticated goes through here).
 */
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api";

export class ApiRequestError extends Error {
  status: number;
  code: string;
  details?: Record<string, string[]>;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.status = status;
    this.code = body.error.code;
    this.details = body.error.details;
  }
}

/** Thrown once the refresh token itself is dead — mirrors
 * apps/desktop/src/lib/apiClient.ts's SessionExpiredError. By the time
 * this is thrown, clearSession() has already run, so anything watching
 * the session (the root navigator) reacts and sends the worker back to
 * the login screen on its own. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Session expirée");
  }
}

/** A request never reached the server at all — worker is offline or the
 * server is unreachable. Distinct from ApiRequestError so screens can
 * show "Pas de connexion" instead of a server-side error message. */
export class NetworkError extends Error {
  constructor() {
    super("Connexion réseau indisponible");
  }
}

async function parseErrorBody(res: Response): Promise<ApiErrorBody> {
  try {
    return (await res.json()) as ApiErrorBody;
  } catch {
    return { error: { message: res.statusText || "Erreur inconnue", code: "UNKNOWN" } };
  }
}

async function rawRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new NetworkError();
  }
  if (!res.ok) throw new ApiRequestError(res.status, await parseErrorBody(res));
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface RefreshResponse {
  accessToken: string;
  refreshToken: string;
}

let refreshPromise: Promise<void> | null = null;

async function performRefresh(): Promise<void> {
  const token = getRefreshToken();
  if (!token) {
    clearSession();
    throw new SessionExpiredError();
  }
  try {
    const result = await rawRequest<RefreshResponse>("/auth/refresh", {
      method: "POST",
      body: JSON.stringify({ refreshToken: token }),
    });
    updateTokens(result.accessToken, result.refreshToken);
  } catch (err) {
    if (err instanceof NetworkError) throw err; // don't kill the session over a dropped connection
    clearSession();
    throw new SessionExpiredError();
  }
}

function refreshOnce(): Promise<void> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

/** Exposed for lib/photoUpload.ts: the file-upload path uses
 * expo-file-system's native UploadTask, which bypasses `fetch` entirely
 * and therefore this module's own 401-retry logic — it needs a way to
 * force a fresh access token before/after a 401 of its own. */
export async function refreshAccessToken(): Promise<string> {
  await refreshOnce();
  const session = getSession();
  if (!session) throw new SessionExpiredError();
  return session.accessToken;
}

async function authenticatedRequest<T>(path: string, init: RequestInit, isRetry: boolean): Promise<T> {
  const session = getSession();
  const headers: HeadersInit = { "Content-Type": "application/json", ...init.headers };
  if (session) {
    (headers as Record<string, string>).Authorization = `Bearer ${session.accessToken}`;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...init, headers });
  } catch {
    throw new NetworkError();
  }

  if (res.status === 401 && session && !isRetry) {
    await refreshOnce();
    return authenticatedRequest<T>(path, init, true);
  }

  if (!res.ok) {
    throw new ApiRequestError(res.status, await parseErrorBody(res));
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  return authenticatedRequest<T>(path, init, false);
}

export const apiClient = {
  get: <T>(path: string) => request<T>(path, { method: "GET" }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "POST", body: body !== undefined ? JSON.stringify(body) : undefined }),
  patch: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: "PATCH", body: body !== undefined ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => request<T>(path, { method: "DELETE" }),
  raw: rawRequest,
};

export function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}
