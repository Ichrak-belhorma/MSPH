import type { ApiErrorBody, HealthCheckResponse } from '@msph/shared';

/**
 * Thin fetch wrapper for the Express API — same contract as
 * apps/desktop/src/lib/api.ts. The mobile app holds no business logic or
 * local database; everything a worker sees comes from here.
 *
 * EXPO_PUBLIC_API_BASE_URL must point at a host reachable from the device,
 * not `localhost` (that resolves to the phone itself). When testing with
 * Expo Go on a physical device, use your machine's LAN IP, e.g.
 * http://192.168.1.20:4000/api.
 */
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:4000/api';

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
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
    throw new ApiRequestError(res.status, body ?? { error: { message: res.statusText, code: 'UNKNOWN' } });
  }

  return res.json() as Promise<T>;
}

export const api = {
  health: () => request<HealthCheckResponse>('/health'),
};
