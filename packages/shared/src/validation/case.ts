import { z } from "zod";
import { CasePriority, CaseStatus } from "../enums.js";
import {
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalString,
  phoneSchema,
  requiredString,
} from "./common.js";

const newCustomerSchema = z.object({
  firstName: requiredString("Customer first name", 100),
  lastName: requiredString("Customer last name", 100),
  phone: phoneSchema,
  email: optionalEmailSchema,
});

const newLandlordSchema = z.object({
  firstName: requiredString("Landlord first name", 100),
  lastName: requiredString("Landlord last name", 100),
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
});

const newPropertySchema = z.object({
  address: requiredString("Address", 255),
  city: requiredString("City", 100),
  postalCode: requiredString("Postal code", 20),
  additionalAddressInformation: optionalString(500),
  /** Omit to create the case without landlord info yet — it can be filled
   * in later once the manager tracks it down. */
  landlord: newLandlordSchema.optional(),
});

/**
 * The manual "New Case" intake workflow described in the product brief:
 * a manager reads an incoming customer email and transcribes it here.
 * Optionally schedules the initial inspection visit in the same step.
 */
export const createCaseSchema = z.object({
  customer: newCustomerSchema,
  property: newPropertySchema,
  problemDescription: requiredString("Problem description", 4000),
  priority: z.enum([CasePriority.LOW, CasePriority.MEDIUM, CasePriority.HIGH, CasePriority.URGENT]).default(CasePriority.MEDIUM),
  /** ISO datetime. When provided, an INITIAL_INSPECTION visit is created
   * alongside the case so the manager doesn't need a second step. */
  initialVisitScheduledAt: z.string().datetime().optional(),
  assignedWorkerId: z.string().cuid().optional(),
});
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const updateCaseSchema = z.object({
  problemDescription: requiredString("Problem description", 4000).optional(),
  status: z
    .enum([CaseStatus.NEW, CaseStatus.SCHEDULED, CaseStatus.IN_PROGRESS, CaseStatus.RESOLVED, CaseStatus.CANCELLED])
    .optional(),
  priority: z.enum([CasePriority.LOW, CasePriority.MEDIUM, CasePriority.HIGH, CasePriority.URGENT]).optional(),
});
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;

export const caseListQuerySchema = z.object({
  status: z
    .enum([CaseStatus.NEW, CaseStatus.SCHEDULED, CaseStatus.IN_PROGRESS, CaseStatus.RESOLVED, CaseStatus.CANCELLED])
    .optional(),
  assignedWorkerId: z.string().cuid().optional(),
  search: z.string().trim().max(200).optional(),
});
export type CaseListQuery = z.infer<typeof caseListQuerySchema>;
