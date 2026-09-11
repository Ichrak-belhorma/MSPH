import type {
  CaseActivityType,
  CasePriority,
  CaseStatus,
  CaseTreatmentStatus,
  UserRole,
  VisitStatus,
  VisitType,
} from "../enums.js";

/**
 * Domain entity shapes as they cross the API boundary (JSON — dates are
 * ISO strings, not Date instances). These intentionally mirror the Prisma
 * models in apps/server/prisma/schema.prisma field-for-field so DTOs can be
 * built with `Pick`/`Omit` instead of re-declaring fields.
 */

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: UserRole;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Landlord {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Property {
  id: string;
  address: string;
  city: string;
  postalCode: string;
  additionalAddressInformation: string | null;
  landlordId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Case {
  id: string;
  customerId: string;
  propertyId: string;
  problemDescription: string;
  status: CaseStatus;
  priority: CasePriority;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
}

export interface Visit {
  id: string;
  caseId: string;
  assignedWorkerId: string | null;
  scheduledAt: string;
  startedAt: string | null;
  completedAt: string | null;
  type: VisitType;
  status: VisitStatus;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Inspection {
  id: string;
  visitId: string;
  observations: string | null;
  remarks: string | null;
  condition: string | null;
  createdAt: string;
}

export interface Photo {
  id: string;
  caseId: string;
  visitId: string | null;
  storageKey: string;
  url: string | null;
  caption: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

export interface Treatment {
  id: string;
  name: string;
  description: string | null;
  instructions: string | null;
  durationMinutes: number | null;
  numberOfVisits: number | null;
  safetyInformation: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CaseTreatment {
  id: string;
  caseId: string;
  treatmentId: string;
  visitId: string | null;
  status: CaseTreatmentStatus;
  notes: string | null;
  performedAt: string | null;
  performedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CaseActivity {
  id: string;
  caseId: string;
  type: CaseActivityType;
  /** Short human-readable summary generated server-side at write time, e.g.
   * "Visit scheduled for Jan 12, 2pm (Initial Inspection)" — clients render
   * this directly rather than re-deriving text from `type` + `metadata`. */
  message: string;
  /** Free-form structured detail for consumers that want more than the
   * message text (e.g. the visit id a VISIT_SCHEDULED event refers to). */
  metadata: Record<string, unknown> | null;
  /** The user who performed the action. Null for system-derived events
   * (e.g. an automatic status recalculation with no single actor). */
  actorId: string | null;
  createdAt: string;
}

/** Case with its most commonly needed relations expanded — the shape the
 * case detail screen (desktop) and visit detail screen (mobile) work with. */
export interface CaseWithRelations extends Case {
  customer: Customer;
  property: Property & { landlord: Landlord | null };
  visits: (Visit & { assignedWorker: Pick<User, "id" | "firstName" | "lastName"> | null; inspection: Inspection | null })[];
  photos: Photo[];
  treatments: (CaseTreatment & { treatment: Treatment })[];
  activities: CaseActivity[];
}
