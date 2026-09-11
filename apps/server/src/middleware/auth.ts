import type { NextFunction, Request, Response } from "express";
import { UserRole } from "@msph/shared";
import { verifyAccessToken } from "../lib/jwt.js";
import { ApiError } from "./errorHandler.js";

export interface AuthUser {
  id: string;
  role: UserRole;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** Set by requireAuth once the bearer token verifies. Absent on
       * public routes (health check, login, refresh). */
      user?: AuthUser;
    }
  }
}

/** Verifies the `Authorization: Bearer <token>` header and attaches
 * `req.user`. Every route except /health, /auth/login and /auth/refresh
 * sits behind this. */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.header("authorization");
  if (!header?.startsWith("Bearer ")) {
    next(ApiError.unauthorized("Missing bearer token"));
    return;
  }
  const token = header.slice("Bearer ".length);
  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(ApiError.unauthorized("Invalid or expired token"));
  }
}

/** Restricts a route to specific roles. Must run after requireAuth.
 * Returns 403 (not 404) on mismatch — the resource exists, the caller
 * just isn't allowed to touch it, which is useful signal for the client
 * and matches the brief: "workers must not have unrestricted
 * administrative access", not "workers can't tell these routes exist". */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) {
      next(ApiError.unauthorized());
      return;
    }
    if (!roles.includes(req.user.role)) {
      next(ApiError.forbidden("You do not have permission to perform this action"));
      return;
    }
    next();
  };
}

/** Shorthand for the common case — most admin-only routes just need this. */
export const requireAdmin = requireRole(UserRole.ADMIN);
