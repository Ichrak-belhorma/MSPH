import { Router } from "express";
import type { HealthCheckResponse } from "@msph/shared";
import { prisma } from "../lib/prisma.js";

export const healthRouter = Router();

const startedAt = Date.now();

healthRouter.get("/", async (_req, res) => {
  let database: HealthCheckResponse["database"] = "disconnected";
  try {
    await prisma.$queryRaw`SELECT 1`;
    database = "connected";
  } catch {
    database = "disconnected";
  }

  const body: HealthCheckResponse = {
    status: "ok",
    uptimeSeconds: Math.round((Date.now() - startedAt) / 1000),
    timestamp: new Date().toISOString(),
    database,
  };

  res.status(database === "connected" ? 200 : 503).json(body);
});
