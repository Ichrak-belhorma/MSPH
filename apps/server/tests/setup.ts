import { afterAll, beforeEach } from "vitest";
import { prisma } from "../src/lib/prisma.js";

/**
 * Deletes every row from every app table, in FK-safe (children-first)
 * order, inside one transaction. Runs before each test — tests never
 * rely on state left over from a previous test, and never need to clean
 * up after themselves.
 */
async function truncateAll(): Promise<void> {
  await prisma.$transaction([
    prisma.caseActivity.deleteMany(),
    prisma.photo.deleteMany(),
    prisma.caseTreatment.deleteMany(),
    prisma.inspection.deleteMany(),
    prisma.visit.deleteMany(),
    prisma.case.deleteMany(),
    prisma.property.deleteMany(),
    prisma.landlord.deleteMany(),
    prisma.customer.deleteMany(),
    prisma.treatment.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);
}

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await prisma.$disconnect();
});
