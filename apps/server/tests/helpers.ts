import request from "supertest";
import type { UserRole } from "@msph/shared";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

/** One Express app instance for the whole suite — built directly (no
 * `initSocket`/`listen`), so tests hit the real routing/middleware/
 * validation/service/Prisma stack through supertest without a real
 * socket. */
export const app = createApp();

let counter = 0;
/** Unique-enough per test run — avoids colliding with another test's
 * fixture email/id within the same `beforeEach`-truncated database. */
function unique(label: string): string {
  counter += 1;
  return `${label}-${Date.now()}-${counter}`;
}

const DEFAULT_PASSWORD = "Password123";

export async function createUserFixture(overrides: {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string | null;
  role?: UserRole;
  active?: boolean;
  password?: string;
} = {}) {
  const password = overrides.password ?? DEFAULT_PASSWORD;
  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: {
      firstName: overrides.firstName ?? "Test",
      lastName: overrides.lastName ?? "User",
      email: overrides.email ?? `${unique("user")}@test.local`,
      phone: overrides.phone ?? undefined,
      role: overrides.role ?? "WORKER",
      active: overrides.active ?? true,
      passwordHash,
    },
  });
  return { user, password };
}

interface LoginResult {
  accessToken: string;
  refreshToken: string;
  user: { id: string; email: string; role: UserRole };
}

export async function loginAs(email: string, password: string): Promise<LoginResult> {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  if (res.status !== 200) {
    throw new Error(`Test login failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return res.body as LoginResult;
}

/** Creates + logs in an admin. Returns the DB row plus ready-to-use tokens. */
export async function createAdmin() {
  const { user, password } = await createUserFixture({ role: "ADMIN" });
  const session = await loginAs(user.email, password);
  return { ...session, dbUser: user };
}

/** Creates + logs in a worker. Returns the DB row plus ready-to-use tokens. */
export async function createWorker() {
  const { user, password } = await createUserFixture({ role: "WORKER" });
  const session = await loginAs(user.email, password);
  return { ...session, dbUser: user };
}

export function authHeader(accessToken: string): [string, string] {
  return ["Authorization", `Bearer ${accessToken}`];
}

export function createCustomerFixture(overrides: Partial<{ firstName: string; lastName: string; phone: string; email: string }> = {}) {
  return prisma.customer.create({
    data: { firstName: "Cust", lastName: "Omer", phone: "555-1000", ...overrides },
  });
}

export function createPropertyFixture(overrides: Partial<{ address: string; city: string; postalCode: string; landlordId: string }> = {}) {
  return prisma.property.create({
    data: { address: "1 Test St", city: "Testville", postalCode: "00000", ...overrides },
  });
}

export function createTreatmentFixture(overrides: Partial<{ name: string; active: boolean }> = {}) {
  return prisma.treatment.create({
    data: { name: overrides.name ?? unique("Treatment"), active: overrides.active ?? true },
  });
}

/** End-to-end fixture: a case with a customer + property already attached,
 * created directly through Prisma (fast) rather than the API — tests that
 * care about the *creation* endpoint itself use the real POST /cases
 * instead of this. */
export async function createCaseFixture(overrides: Partial<{ problemDescription: string; priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT" }> = {}) {
  const customer = await createCustomerFixture();
  const property = await createPropertyFixture();
  const kase = await prisma.case.create({
    data: {
      customerId: customer.id,
      propertyId: property.id,
      problemDescription: overrides.problemDescription ?? "Test problem",
      priority: overrides.priority ?? "MEDIUM",
    },
  });
  return { case: kase, customer, property };
}
