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

export const cuidSchema = z.string().cuid();

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
