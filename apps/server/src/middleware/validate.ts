import type { NextFunction, Request, Response } from "express";
import type { ZodTypeAny, z } from "zod";

/** Parses `req.body` against `schema`, replacing it with the parsed (and
 * coerced/defaulted) value, or forwards a ZodError to errorHandler. */
export function validateBody<S extends ZodTypeAny>(schema: S) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      req.body = schema.parse(req.body) as z.infer<S>;
      next();
    } catch (err) {
      next(err);
    }
  };
}

/** Same as validateBody but for `req.query`. */
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
