import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny } from "zod";

/** Parses `req.body` against `schema`, replacing it with the parsed (and
 * coerced/defaulted) value, or forwards a ZodError to errorHandler. Read
 * the typed result back in the handler with `body<T>(req)`. */
export function validateBody<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Same as validateBody but for `req.query`. Read back with `query<T>(req)`. */
export function validateQuery<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.query = schema.parse(req.query) as never;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/**
 * Typed accessors for the already-validated body/query. Express types
 * `req.body`/`req.query` loosely (`any`/`ParsedQs`), so a cast is
 * unavoidable somewhere — these centralize it in one documented place
 * instead of every route handler casting inline. Only safe to call
 * *after* the corresponding `validateBody`/`validateQuery` middleware has
 * run for that route.
 */
export function body<T>(req: Request): T {
  return req.body as T;
}

export function query<T>(req: Request): T {
  return req.query as unknown as T;
}
