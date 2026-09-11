import argon2 from "argon2";
import { PrismaClient } from "@prisma/client";

/**
 * Minimal dev seed: one admin login so the desktop/mobile apps have
 * something to authenticate with once login is implemented, plus a couple
 * of starter treatments so the catalog isn't empty. Safe to re-run —
 * upserts everything.
 */
const prisma = new PrismaClient();

async function main() {
  const adminEmail = "admin@msph.local";
  const passwordHash = await argon2.hash("ChangeMe123!");

  const admin = await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      firstName: "Admin",
      lastName: "User",
      email: adminEmail,
      passwordHash,
      role: "ADMIN",
    },
  });

  const treatments = [
    {
      name: "General Cockroach Treatment",
      description: "Gel bait and residual spray application for cockroach infestations.",
      instructions:
        "Apply gel bait to cracks, crevices and under appliances. Apply residual spray along baseboards. Avoid treating food prep surfaces directly.",
      durationMinutes: 60,
      numberOfVisits: 2,
      safetyInformation: "Vacate treated rooms for 2 hours. Keep pets away from bait stations.",
    },
    {
      name: "Rodent Baiting - Exterior",
      description: "Tamper-resistant exterior bait stations for rodent control.",
      instructions: "Install bait stations at 20-30 ft intervals along the exterior perimeter. Check and refill weekly.",
      durationMinutes: 45,
      numberOfVisits: 4,
      safetyInformation: "Stations are tamper-resistant but keep clear of children's play areas.",
    },
  ];

  for (const t of treatments) {
    await prisma.treatment.upsert({
      where: { id: t.name.toLowerCase().replace(/\s+/g, "-") },
      update: {},
      create: { id: t.name.toLowerCase().replace(/\s+/g, "-"), ...t },
    });
  }

  console.log(`Seeded admin user: ${admin.email} (password: ChangeMe123!)`);
  console.log(`Seeded ${treatments.length} treatments.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
