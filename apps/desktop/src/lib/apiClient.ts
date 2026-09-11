import type { ApiErrorBody } from "@msph/shared";
import { getApiBaseUrl } from "../config.js";
import { clearSession, getRefreshToken, getSession, updateTokens } from "./authStore.js";

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

/** The refresh token itself is dead (expired, revoked, or reuse-detected
 * — see CONTEXT.md "Authentication"). Callers don't need to special-case
 * this: `authStore.clearSession()` has already run by the time it's
 * thrown, so anything watching the session (the route guard) reacts on
 * its own — this type exists mainly so call sites *can* tell a dead
 * session apart from an ordinary API error if they want to. */
export class SessionExpiredError extends Error {
  constructor() {
    super("Session expirée");
  }
}

async function parseErrorBody(res: Response): Promise<ApiErrorBody> {
  try {
    return (await res.json()) as ApiErrorBody;
  } catch {
    return { error: { message: res.statusText || "Erreur inconnue", code: "UNKNOWN" } };
  }
}

/** No auth header, no 401-retry loop — used only for the two endpoints
 * that must work without (or despite) a valid access token. */
async function rawRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${getApiBaseUrl()}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...init.headers },
  });
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
  } catch {
    clearSession();
    throw new SessionExpiredError();
  }
}

/** De-dupes concurrent refreshes: if five requests 401 at once (e.g. a
 * dashboard firing several queries), only the first triggers a real
 * `/auth/refresh` call — the rest await the same in-flight promise
 * instead of each racing to rotate the refresh token. */
function refreshOnce(): Promise<void> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

async function authenticatedRequest<T>(path: string, init: RequestInit, isRetry: boolean): Promise<T> {
  const session = getSession();
  const headers: HeadersInit = { "Content-Type": "application/json", ...init.headers };
  if (session) {
    (headers as Record<string, string>).Authorization = `Bearer ${session.accessToken}`;
  }

  const res = await fetch(`${getApiBaseUrl()}${path}`, { ...init, headers });

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
  /** For the two unauthenticated auth endpoints (login, and refresh when
   * called directly rather than through the 401 pathway above). */
  raw: rawRequest,
};

/** Builds a `?a=1&b=2` query string, dropping undefined/empty values —
 * every list endpoint's filters go through this. */
export function toQueryString(params: Record<string, string | number | boolean | undefined>): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") usp.set(key, String(value));
  }
  const qs = usp.toString();
  return qs ? `?${qs}` : "";
}
