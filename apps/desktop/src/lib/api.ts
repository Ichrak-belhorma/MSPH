import type { ApiErrorBody, HealthCheckResponse } from "@msph/shared";

/**
 * Thin fetch wrapper for the Express API. The desktop and mobile apps never
 * implement business logic locally — every read/write goes through here (or
 * the mobile equivalent) so the server stays the single source of truth.
 */
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:4000/api";

export class ApiRequestError extends Error {
  status: number;
  code: string;

  constructor(status: number, body: ApiErrorBody) {
    super(body.error.message);
    this.status = status;
    this.code = body.error.code;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiRequestError(
      res.status,
      body ?? { error: { message: res.statusText, code: "UNKNOWN" } },
    );
  }

  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthCheckResponse>("/health"),
};
