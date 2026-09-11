import { z } from "zod";
import { CasePriority, CaseStatus } from "../enums.js";
import {
  cuidSchema,
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalString,
  paginationQuerySchema,
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
  /** Omit to create the property without landlord info yet — it can be
   * filled in later once the manager tracks it down. Ignored if
   * `landlordId` is also provided. */
  landlord: newLandlordSchema.optional(),
  /** Attach to an existing landlord instead of creating one. */
  landlordId: cuidSchema.optional(),
});

/**
 * The manual "New Case" intake workflow described in the product brief:
 * a manager reads an incoming customer email and transcribes it here.
 *
 * Deviation from a naive "always nest a brand-new customer/property"
 * shape: a repeat customer or a property the company already services is
 * common (rental turnover, recurring service), so the manager can instead
 * reference an existing `customerId`/`propertyId`. Enforced via
 * `superRefine` below rather than a discriminated union so the error
 * messages stay readable ("provide customerId or customer", not a union
 * mismatch dump).
 */
export const createCaseSchema = z
  .object({
    customerId: cuidSchema.optional(),
    customer: newCustomerSchema.optional(),
    propertyId: cuidSchema.optional(),
    property: newPropertySchema.optional(),
    problemDescription: requiredString("Problem description", 4000),
    priority: z
      .enum([CasePriority.LOW, CasePriority.MEDIUM, CasePriority.HIGH, CasePriority.URGENT])
      .default(CasePriority.MEDIUM),
    /** ISO datetime. When provided, an INITIAL_INSPECTION visit is created
     * alongside the case so the manager doesn't need a second step. */
    initialVisitScheduledAt: z.string().datetime().optional(),
    assignedWorkerId: cuidSchema.optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.customerId && !data.customer) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customer"], message: "Provide either customerId or customer" });
    }
    if (data.customerId && data.customer) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["customer"], message: "Provide only one of customerId or customer" });
    }
    if (!data.propertyId && !data.property) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["property"], message: "Provide either propertyId or property" });
    }
    if (data.propertyId && data.property) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["property"], message: "Provide only one of propertyId or property" });
    }
  });
export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const updateCaseSchema = z.object({
  problemDescription: requiredString("Problem description", 4000).optional(),
  priority: z.enum([CasePriority.LOW, CasePriority.MEDIUM, CasePriority.HIGH, CasePriority.URGENT]).optional(),
  /**
   * Direct status changes are an ADMIN-only escape hatch (enforced in the
   * route, not here) for the two actions the brief reserves for admins —
   * resolving and cancelling a case — and for correcting/reopening one.
   * Everyday transitions (NEW -> SCHEDULED -> IN_PROGRESS) happen
   * automatically as visits are scheduled/started/completed; see
   * apps/server/src/modules/cases/case-status.ts.
   */
  status: z
    .enum([CaseStatus.NEW, CaseStatus.SCHEDULED, CaseStatus.IN_PROGRESS, CaseStatus.RESOLVED, CaseStatus.CANCELLED])
    .optional(),
});
export type UpdateCaseInput = z.infer<typeof updateCaseSchema>;

export const caseListQuerySchema = paginationQuerySchema.extend({
  status: z
    .enum([CaseStatus.NEW, CaseStatus.SCHEDULED, CaseStatus.IN_PROGRESS, CaseStatus.RESOLVED, CaseStatus.CANCELLED])
    .optional(),
  /** Cases with at least one visit assigned to this worker. Workers have
   * this forced to their own id server-side regardless of what they send. */
  assignedWorkerId: cuidSchema.optional(),
  search: z.string().trim().max(200).optional(),
});
export type CaseListQuery = z.infer<typeof caseListQuerySchema>;
