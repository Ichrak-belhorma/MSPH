import { z } from "zod";
import { VisitStatus, VisitType } from "../enums.js";
import { optionalString } from "./common.js";

export const scheduleVisitSchema = z.object({
  caseId: z.string().cuid(),
  type: z.enum([VisitType.INITIAL_INSPECTION, VisitType.TREATMENT, VisitType.FOLLOW_UP, VisitType.OTHER]),
  scheduledAt: z.string().datetime(),
  assignedWorkerId: z.string().cuid().optional(),
  notes: optionalString(2000),
});
export type ScheduleVisitInput = z.infer<typeof scheduleVisitSchema>;

export const updateVisitSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  assignedWorkerId: z.string().cuid().nullable().optional(),
  status: z
    .enum([VisitStatus.SCHEDULED, VisitStatus.IN_PROGRESS, VisitStatus.COMPLETED, VisitStatus.CANCELLED, VisitStatus.NO_SHOW])
    .optional(),
  notes: optionalString(2000),
});
export type UpdateVisitInput = z.infer<typeof updateVisitSchema>;

/** Worker taps "Start visit" in the mobile app. */
export const startVisitSchema = z.object({
  startedAt: z.string().datetime().optional(),
});

/**
 * Worker taps "Complete visit" — the single field they fill in the most:
 * the on-site inspection record. `condition` is intentionally free text
 * (e.g. "Heavy roach activity under sink") rather than a fixed enum,
 * since pest/property conditions vary too widely to enumerate usefully.
 */
export const completeVisitSchema = z.object({
  completedAt: z.string().datetime().optional(),
  observations: optionalString(4000),
  remarks: optionalString(4000),
  condition: optionalString(500),
});
export type CompleteVisitInput = z.infer<typeof completeVisitSchema>;

export const createInspectionSchema = z.object({
  visitId: z.string().cuid(),
  observations: optionalString(4000),
  remarks: optionalString(4000),
  condition: optionalString(500),
});
export type CreateInspectionInput = z.infer<typeof createInspectionSchema>;
