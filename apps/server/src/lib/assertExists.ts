import { ApiError } from "../middleware/errorHandler.js";

/**
 * Looks up a foreign-key target before writing a row that references it,
 * so a bad id comes back as a clean 400 ("X does not refer to an existing
 * Y") instead of a raw Postgres FK-violation bubbling up as a 500.
 */
export async function assertExists<T>(finder: () => Promise<T | null>, message: string): Promise<T> {
  const result = await finder();
  if (!result) throw ApiError.badRequest(message);
  return result;
}
