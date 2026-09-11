import { z } from "zod";

/** Trims and rejects empty strings — the baseline for required text inputs. */
export const requiredString = (label: string, max = 255) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be ${max} characters or fewer`);

export const optionalString = (max = 2000) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v === "" ? undefined : v));

export const emailSchema = z.string().trim().toLowerCase().email("Invalid email address");

export const optionalEmailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Invalid email address")
  .optional()
  .or(z.literal("").transform(() => undefined));

/** Loose on purpose — international formats, spaces and punctuation vary and
 * this app never dials the number programmatically, only displays/calls it. */
export const phoneSchema = z
  .string()
  .trim()
  .min(6, "Phone number is too short")
  .max(30, "Phone number is too long")
  .regex(/^[0-9+()\-.\s]+$/, "Phone number contains invalid characters");

export const optionalPhoneSchema = phoneSchema
  .optional()
  .or(z.literal("").transform(() => undefined));

/**
 * Validates an id field referencing a row created by Prisma's
 * `@default(cuid())`.
 *
 * Deliberately NOT `z.string().cuid()` (which enforces the exact cuid
 * algorithm's character format): seed data intentionally uses
 * human-readable ids for a few fixtures (e.g. "seed-case-1",
 * "general-cockroach-treatment" — see apps/server/prisma/seed.ts) so a
 * developer can reference them by hand while testing, and id format is
 * otherwise an implementation detail the API shouldn't be coupled to (it
 * could change to UUIDs later without touching every schema). This still
 * rejects the actually-invalid cases — empty, absurdly long, or the
 * wrong type — a real 404 from Prisma handles "well-formed but unknown
 * id" the same way either strategy would.
 */
export const cuidSchema = z
  .string()
  .trim()
  .min(1, "id is required")
  .max(191, "id is too long");

/**
 * A boolean query-string param ("?active=false").
 *
 * `z.coerce.boolean()` is a trap here: it does `Boolean(value)`, and
 * `Boolean("false")` is `true` (any non-empty string is truthy) — so
 * `?active=false` would silently mean "true". This accepts only the
 * literal strings "true"/"false" (or an actual boolean, for callers that
 * construct the query object directly rather than parsing a URL).
 */
export const booleanQueryParam = z
  .union([z.literal("true"), z.literal("false"), z.boolean()])
  .transform((v) => (typeof v === "boolean" ? v : v === "true"));

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
