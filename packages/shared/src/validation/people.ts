import { z } from "zod";
import { UserRole } from "../enums.js";
import { optionalEmailSchema, optionalPhoneSchema, optionalString, phoneSchema, requiredString } from "./common.js";
import { passwordSchema } from "./auth.js";

export const updateCustomerSchema = z.object({
  firstName: requiredString("First name", 100).optional(),
  lastName: requiredString("Last name", 100).optional(),
  phone: phoneSchema.optional(),
  email: optionalEmailSchema,
});
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

export const updateLandlordSchema = z.object({
  firstName: requiredString("First name", 100).optional(),
  lastName: requiredString("Last name", 100).optional(),
  phone: optionalPhoneSchema,
  email: optionalEmailSchema,
});
export type UpdateLandlordInput = z.infer<typeof updateLandlordSchema>;

export const updatePropertySchema = z.object({
  address: requiredString("Address", 255).optional(),
  city: requiredString("City", 100).optional(),
  postalCode: requiredString("Postal code", 20).optional(),
  additionalAddressInformation: optionalString(500),
  landlordId: z.string().cuid().nullable().optional(),
});
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

/** Admin-only: provisioning a new worker/admin account. */
export const createUserSchema = z.object({
  firstName: requiredString("First name", 100),
  lastName: requiredString("Last name", 100),
  email: z.string().trim().toLowerCase().email(),
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
