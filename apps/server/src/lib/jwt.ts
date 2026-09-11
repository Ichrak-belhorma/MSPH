import { createHash, randomUUID } from "node:crypto";
import jwt from "jsonwebtoken";
import type { UserRole } from "@msph/shared";
import { env } from "../config/env.js";

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

export interface RefreshTokenPayload {
  sub: string;
  /** Matches `RefreshToken.id` in the DB — lets us look up/revoke the
   * specific token row without storing the raw token anywhere. */
  jti: string;
}

export interface SignedRefreshToken {
  token: string;
  jti: string;
  expiresAt: Date;
}

/** @types/jsonwebtoken's `expiresIn` is typed against `ms`'s strict string
 * literal union ("15m" | "30d" | ...), which a runtime env string can never
 * statically satisfy even though it's validated at boot (see
 * config/env.ts). Cast once here instead of sprinkling `as any` at every
 * call site. */
function asExpiresIn(value: string): jwt.SignOptions["expiresIn"] {
  return value as jwt.SignOptions["expiresIn"];
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, { expiresIn: asExpiresIn(env.JWT_ACCESS_TTL) });
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  return jwt.verify(token, env.JWT_ACCESS_SECRET) as AccessTokenPayload;
}

export function signRefreshToken(userId: string): SignedRefreshToken {
  const jti = randomUUID();
  const payload: RefreshTokenPayload = { sub: userId, jti };
  const token = jwt.sign(payload, env.JWT_REFRESH_SECRET, { expiresIn: asExpiresIn(env.JWT_REFRESH_TTL) });
  // Read the expiry back off the token we just signed rather than
  // computing it separately (e.g. via `ms(env.JWT_REFRESH_TTL)`), so the
  // DB record can never drift from what the JWT itself actually says.
  const decoded = jwt.decode(token) as { exp: number };
  return { token, jti, expiresAt: new Date(decoded.exp * 1000) };
}

export function verifyRefreshToken(token: string): RefreshTokenPayload {
  return jwt.verify(token, env.JWT_REFRESH_SECRET) as RefreshTokenPayload;
}

/** We store this, never the raw token, in `RefreshToken.tokenHash` — a DB
 * leak alone then can't be replayed as a working session. Looked up
 * alongside the primary-key (`jti`) lookup as a belt-and-suspenders check,
 * not the sole revocation mechanism. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
