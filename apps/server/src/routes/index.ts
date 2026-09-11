import { Router } from "express";
import { healthRouter } from "./health.routes.js";

export const apiRouter = Router();

apiRouter.use("/health", healthRouter);

// Next up (see CONTEXT.md "Next steps"): auth, users, customers, landlords,
// properties, cases, visits, treatments, photos routers mount here.
