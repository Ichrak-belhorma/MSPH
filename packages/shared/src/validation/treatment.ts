import { z } from "zod";
import { CaseTreatmentStatus } from "../enums.js";
import { optionalString, requiredString } from "./common.js";

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

/** Manager attaches one or more catalog treatments to a case (step 6-7 of
 * the workflow: "the company chooses one or several treatments"). */
export const assignTreatmentToCaseSchema = z.object({
  treatmentId: z.string().cuid(),
  visitId: z.string().cuid().optional(),
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
