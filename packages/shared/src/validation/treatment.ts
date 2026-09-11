import { z } from "zod";
import { CaseTreatmentStatus } from "../enums.js";
import { booleanQueryParam, cuidSchema, optionalString, paginationQuerySchema, requiredString } from "./common.js";

export const createTreatmentSchema = z.object({
  name: requiredString("Name", 150),
  description: optionalString(2000),
  instructions: optionalString(4000),
  durationMinutes: z.number().int().positive().max(10_080).optional(),
  numberOfVisits: z.number().int().positive().max(50).optional(),
  safetyInformation: optionalString(4000),
  notes: optionalString(2000),
  active: z.boolean().default(true),
});
export type CreateTreatmentInput = z.infer<typeof createTreatmentSchema>;

export const updateTreatmentSchema = createTreatmentSchema.partial();
export type UpdateTreatmentInput = z.infer<typeof updateTreatmentSchema>;

export const treatmentListQuerySchema = paginationQuerySchema.extend({
  /** Defaults to true server-side (hide retired treatments from the
   * picker) — pass active=false explicitly to see retired ones too. */
  active: booleanQueryParam.optional(),
  search: z.string().trim().max(200).optional(),
});
export type TreatmentListQuery = z.infer<typeof treatmentListQuerySchema>;

/** Manager attaches one or more catalog treatments to a case (step 6-7 of
 * the workflow: "the company chooses one or several treatments"). */
export const assignTreatmentToCaseSchema = z.object({
  treatmentId: cuidSchema,
  visitId: cuidSchema.optional(),
  notes: optionalString(2000),
});
export type AssignTreatmentToCaseInput = z.infer<typeof assignTreatmentToCaseSchema>;

export const updateCaseTreatmentSchema = z.object({
  status: z
    .enum([CaseTreatmentStatus.PLANNED, CaseTreatmentStatus.COMPLETED, CaseTreatmentStatus.CANCELLED])
    .optional(),
  notes: optionalString(2000),
  performedAt: z.string().datetime().optional(),
});
export type UpdateCaseTreatmentInput = z.infer<typeof updateCaseTreatmentSchema>;
