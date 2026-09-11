import { z } from "zod";
import { UserRole } from "../enums.js";
import {
  booleanQueryParam,
  cuidSchema,
  emailSchema,
  optionalEmailSchema,
  optionalPhoneSchema,
  optionalString,
  paginationQuerySchema,
  phoneSchema,
  requiredString,
} from "./common.js";
import { passwordSchema } from "./auth.js";

export const createCustomerSchema = z.object({
  firstName: requiredString("First name", 100),
  lastName: requiredString("Last name", 100),
  phone: phoneSchema,
  email: optionalEmailSchema,
});
export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;

export const updateCustomerSchema = createCustomerSchema.partial();
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const createLandlordSchema = z.object({
  firstName: requiredString("First name", 100),
  lastName: requiredString("Last name", 100),
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
});
export type CreateLandlordInput = z.infer<typeof createLandlordSchema>;

export const updateLandlordSchema = createLandlordSchema.partial();
export type UpdateLandlordInput = z.infer<typeof updateLandlordSchema>;

export const createPropertySchema = z.object({
  address: requiredString("Address", 255),
  city: requiredString("City", 100),
  postalCode: requiredString("Postal code", 20),
  additionalAddressInformation: optionalString(500),
  landlordId: cuidSchema.optional(),
});
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = z.object({
  address: requiredString("Address", 255).optional(),
  city: requiredString("City", 100).optional(),
  postalCode: requiredString("Postal code", 20).optional(),
  additionalAddressInformation: optionalString(500),
  landlordId: cuidSchema.nullable().optional(),
});
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

/** Shared shape for the Customers/Landlords/Properties list endpoints —
 * simple paginated + free-text search, nothing fancier is needed yet. */
export const peopleListQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(200).optional(),
});
export type PeopleListQuery = z.infer<typeof peopleListQuerySchema>;

/** Admin-only: provisioning a new worker/admin account. There is no
 * public registration endpoint — accounts only exist because an admin
 * created them (correct for an internal tool with no self-serve signup). */
export const createUserSchema = z.object({
  firstName: requiredString("First name", 100),
  lastName: requiredString("Last name", 100),
  email: emailSchema,
  phone: optionalPhoneSchema,
  password: passwordSchema,
  role: z.enum([UserRole.ADMIN, UserRole.WORKER]).default(UserRole.WORKER),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const updateUserSchema = z.object({
  firstName: requiredString("First name", 100).optional(),
  lastName: requiredString("Last name", 100).optional(),
  phone: optionalPhoneSchema,
  role: z.enum([UserRole.ADMIN, UserRole.WORKER]).optional(),
  active: z.boolean().optional(),
});
export type UpdateUserInput = z.infer<typeof updateUserSchema>;

export const userListQuerySchema = paginationQuerySchema.extend({
  role: z.enum([UserRole.ADMIN, UserRole.WORKER]).optional(),
  active: booleanQueryParam.optional(),
});
export type UserListQuery = z.infer<typeof userListQuerySchema>;
