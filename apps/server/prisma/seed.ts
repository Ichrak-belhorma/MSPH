import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

/**
 * Dev seed: an admin login, a worker login, a couple of starter
 * treatments, and one sample case with a scheduled visit — enough to log
 * in as either role and immediately exercise the API by hand (see
 * CONTEXT.md "Commands reference" for a curl walkthrough). Safe to
 * re-run — upserts everything, never duplicates.
 */
const prisma = new PrismaClient();

async function main() {
  const passwordHash = await argon2.hash("ChangeMe123!");

  const admin = await prisma.user.upsert({
    where: { email: "admin@msph.local" },
    update: {},
    create: { firstName: "Admin", lastName: "User", email: "admin@msph.local", passwordHash, role: "ADMIN" },
  });

  const worker = await prisma.user.upsert({
    where: { email: "worker@msph.local" },
    update: {},
    create: { firstName: "Wanda", lastName: "Worker", email: "worker@msph.local", phone: "555-0100", passwordHash, role: "WORKER" },
  });

  const treatments = [
    {
      id: "general-cockroach-treatment",
      name: "General Cockroach Treatment",
      description: "Gel bait and residual spray application for cockroach infestations.",
      instructions:
        "Apply gel bait to cracks, crevices and under appliances. Apply residual spray along baseboards. Avoid treating food prep surfaces directly.",
      durationMinutes: 60,
      numberOfVisits: 2,
      safetyInformation: "Vacate treated rooms for 2 hours. Keep pets away from bait stations.",
    },
    {
      id: "rodent-baiting-exterior",
      name: "Rodent Baiting - Exterior",
      description: "Tamper-resistant exterior bait stations for rodent control.",
      instructions: "Install bait stations at 20-30 ft intervals along the exterior perimeter. Check and refill weekly.",
      durationMinutes: 45,
      numberOfVisits: 4,
      safetyInformation: "Stations are tamper-resistant but keep clear of children's play areas.",
    },
  ];

  for (const t of treatments) {
    await prisma.treatment.upsert({ where: { id: t.id }, update: {}, create: t });
  }

  const landlord = await prisma.landlord.upsert({
    where: { id: "seed-landlord-1" },
    update: {},
    create: { id: "seed-landlord-1", firstName: "Leo", lastName: "Landlord", phone: "555-0200", email: "leo.landlord@example.com" },
  });

  const property = await prisma.property.upsert({
    where: { id: "seed-property-1" },
    update: {},
    create: {
      id: "seed-property-1",
      address: "123 Elm Street, Apt 4B",
      city: "Springfield",
      postalCode: "62701",
      landlordId: landlord.id,
    },
  });

  const customer = await prisma.customer.upsert({
    where: { id: "seed-customer-1" },
    update: {},
    create: { id: "seed-customer-1", firstName: "Carla", lastName: "Customer", phone: "555-0300", email: "carla.customer@example.com" },
  });

  const existingCase = await prisma.case.findFirst({ where: { id: "seed-case-1" } });
  if (!existingCase) {
    const kase = await prisma.case.create({
      data: {
        id: "seed-case-1",
        customerId: customer.id,
        propertyId: property.id,
        problemDescription: "Tenant reports roach activity in the kitchen, especially around the stove and under the sink.",
        priority: "HIGH",
        status: "SCHEDULED",
      },
    });
    await prisma.caseActivity.create({
      data: { caseId: kase.id, type: "CASE_CREATED", message: "Case created", actorId: admin.id },
    });
    const visit = await prisma.visit.create({
      data: {
        caseId: kase.id,
        type: "INITIAL_INSPECTION",
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        assignedWorkerId: worker.id,
      },
    });
    await prisma.caseActivity.create({
      data: {
        caseId: kase.id,
        type: "VISIT_SCHEDULED",
        message: `Initial inspection scheduled for ${visit.scheduledAt.toISOString()}`,
        actorId: admin.id,
        metadata: { visitId: visit.id },
      },
    });
  }

  console.log(`Seeded admin user: admin@msph.local (password: ChangeMe123!)`);
  console.log(`Seeded worker user: worker@msph.local (password: ChangeMe123!)`);
  console.log(`Seeded ${treatments.length} treatments.`);
  console.log(`Seeded 1 sample case (seed-case-1) with a scheduled initial inspection.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
