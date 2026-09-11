import type { NextFunction, Request, Response } from "express";
import { MulterError } from "multer";
import { ZodError } from "zod";
import type { ApiErrorBody } from "@msph/shared";
import { logger } from "../lib/logger.js";

/** Thrown deliberately by route handlers/services for expected failure
 * cases (404, 409, 403, ...) so the error handler can map them to the
 * right HTTP status without every handler writing its own try/catch. */
export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }

  static notFound(what: string) {
    return new ApiError(404, "NOT_FOUND", `${what} not found`);
  }

  static badRequest(message: string) {
    return new ApiError(400, "BAD_REQUEST", message);
  }

  static unauthorized(message = "Unauthorized") {
    return new ApiError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Forbidden") {
    return new ApiError(403, "FORBIDDEN", message);
  }

  static conflict(message: string) {
    return new ApiError(409, "CONFLICT", message);
  }
}

export function notFoundHandler(req: Request, res: Response) {
  const body: ApiErrorBody = {
    error: { message: `No route for ${req.method} ${req.path}`, code: "NOT_FOUND" },
  };
  res.status(404).json(body);
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  if (err instanceof ZodError) {
    const details: Record<string, string[]> = {};
    for (const issue of err.issues) {
      const key = issue.path.join(".") || "_root";
      (details[key] ??= []).push(issue.message);
    }
    const body: ApiErrorBody = {
      error: { message: "Validation failed", code: "VALIDATION_ERROR", details },
    };
    res.status(400).json(body);
    return;
  }

  if (err instanceof ApiError) {
    const body: ApiErrorBody = { error: { message: err.message, code: err.code } };
    res.status(err.status).json(body);
    return;
  }

  // Photo upload failures (file too large, wrong field name, ...) — a
  // client mistake, not a server fault, so 400 rather than falling
  // through to the generic 500 below.
  if (err instanceof MulterError) {
    const body: ApiErrorBody = { error: { message: err.message, code: "UPLOAD_ERROR" } };
    res.status(400).json(body);
    return;
  }
  if (err instanceof Error && err.message === "Only image uploads are allowed") {
    const body: ApiErrorBody = { error: { message: err.message, code: "UPLOAD_ERROR" } };
    res.status(400).json(body);
    return;
  }

  logger.error("Unhandled error", {
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined,
  });
  const body: ApiErrorBody = {
    error: { message: "Internal server error", code: "INTERNAL_ERROR" },
  };
  res.status(500).json(body);
}
