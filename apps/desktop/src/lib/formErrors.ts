import { ZodError } from "zod";

/** Flattens a ZodError into a `{"field.path": message}` map for rendering
 * under each form field — every create/edit form in the app uses this so
 * server-shape validation (via the same @msph/shared schemas the API
 * uses) and inline field errors stay in lockstep. */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ZodError)) return {};
  const out: Record<string, string> = {};
  for (const issue of err.issues) {
    out[issue.path.join(".")] = issue.message;
  }
  return out;
}
