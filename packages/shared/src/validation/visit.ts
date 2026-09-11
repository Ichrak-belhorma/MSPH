import { z } from "zod";
import { VisitStatus, VisitType } from "../enums.js";
import { cuidSchema, optionalString, paginationQuerySchema } from "./common.js";

export const scheduleVisitSchema = z.object({
  caseId: cuidSchema,
  type: z.enum([VisitType.INITIAL_INSPECTION, VisitType.TREATMENT, VisitType.FOLLOW_UP, VisitType.OTHER]),
  scheduledAt: z.string().datetime(),
  assignedWorkerId: cuidSchema.optional(),
  notes: optionalString(2000),
});
export type ScheduleVisitInput = z.infer<typeof scheduleVisitSchema>;

/** Reschedule / reassign / edit notes — an ADMIN action (see brief:
 * "the company schedules the next consultation date"). Workers change a
 * visit's status only via the dedicated start/complete endpoints below,
 * never through this general PATCH. */
export const updateVisitSchema = z.object({
  scheduledAt: z.string().datetime().optional(),
  assignedWorkerId: cuidSchema.nullable().optional(),
  status: z
    .enum([VisitStatus.SCHEDULED, VisitStatus.IN_PROGRESS, VisitStatus.COMPLETED, VisitStatus.CANCELLED, VisitStatus.NO_SHOW])
    .optional(),
  notes: optionalString(2000),
});
export type UpdateVisitInput = z.infer<typeof updateVisitSchema>;

export const visitListQuerySchema = paginationQuerySchema.extend({
  caseId: cuidSchema.optional(),
  /** Workers have this forced to their own id server-side. */
  assignedWorkerId: cuidSchema.optional(),
  status: z
    .enum([VisitStatus.SCHEDULED, VisitStatus.IN_PROGRESS, VisitStatus.COMPLETED, VisitStatus.CANCELLED, VisitStatus.NO_SHOW])
    .optional(),
  type: z.enum([VisitType.INITIAL_INSPECTION, VisitType.TREATMENT, VisitType.FOLLOW_UP, VisitType.OTHER]).optional(),
  /** Filters to visits scheduled on/after this ISO date — powers the
   * mobile "Today" (from=start of today) and "Upcoming" (from=tomorrow)
   * screens without two bespoke endpoints. */
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
});
export type VisitListQuery = z.infer<typeof visitListQuerySchema>;

/** Worker taps "Start visit" in the mobile app. */
export const startVisitSchema = z.object({
  startedAt: z.string().datetime().optional(),
});
export type StartVisitInput = z.infer<typeof startVisitSchema>;

/**
 * Worker taps "Complete visit" — captures the on-site inspection record in
 * the same step so a worker doesn't need two separate actions for the
 * common case. `condition` is intentionally free text (e.g. "Heavy roach
 * activity under sink") rather than a fixed enum — pest/property
 * conditions vary too widely to enumerate usefully. All fields optional:
 * a worker can complete a visit that doesn't need an inspection recorded
 * (e.g. a pure treatment visit), and can also record/update the
 * inspection separately via POST /visits/:id/inspection.
 */
export const completeVisitSchema = z.object({
  completedAt: z.string().datetime().optional(),
  observations: optionalString(4000),
  remarks: optionalString(4000),
  condition: optionalString(500),
});
export type CompleteVisitInput = z.infer<typeof completeVisitSchema>;

/** Body for POST /visits/:id/inspection — visitId comes from the URL. */
export const recordInspectionSchema = z.object({
  observations: optionalString(4000),
  remarks: optionalString(4000),
  condition: optionalString(500),
});
export type RecordInspectionInput = z.infer<typeof recordInspectionSchema>;
