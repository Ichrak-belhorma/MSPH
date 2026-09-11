import type { User } from "./entities.js";

/** Standard success envelope. Kept trivial on purpose — no generic
 * `success: true` wrapper — the HTTP status code already carries that. */
export interface ApiErrorBody {
  error: {
    message: string;
    code: string;
    /** Present for validation errors (Zod field issues). */
    details?: Record<string, string[]>;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface LoginResponse extends AuthTokens {
  user: User;
}

export interface HealthCheckResponse {
  status: "ok";
  uptimeSeconds: number;
  timestamp: string;
  database: "connected" | "disconnected";
}
