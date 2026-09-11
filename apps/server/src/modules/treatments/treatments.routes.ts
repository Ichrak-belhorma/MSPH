import { Router } from "express";
import { createTreatmentSchema, cuidSchema, treatmentListQuerySchema, updateTreatmentSchema } from "@msph/shared";
import type { CreateTreatmentInput, TreatmentListQuery, UpdateTreatmentInput } from "@msph/shared";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { body, query, validateBody, validateQuery } from "../../middleware/validate.js";
import * as treatmentsService from "./treatments.service.js";

/**
 * Treatment catalog. Read access (GET) is open to any authenticated role
 * — a worker performing a visit needs to see instructions/safety
 * information for the treatment they're applying. Only ADMIN can
 * create/edit the catalog itself (see brief: "the company chooses
 * treatments", not the worker).
 */
export const treatmentsRouter = Router();

treatmentsRouter.use(requireAuth);

treatmentsRouter.get("/", validateQuery(treatmentListQuerySchema), async (req, res, next) => {
  try {
    res.json(await treatmentsService.listTreatments(query<TreatmentListQuery>(req)));
  } catch (err) {
    next(err);
  }
});

treatmentsRouter.get("/:id", async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    res.json(await treatmentsService.getTreatment(id));
  } catch (err) {
    next(err);
  }
});

treatmentsRouter.post("/", requireAdmin, validateBody(createTreatmentSchema), async (req, res, next) => {
  try {
    const treatment = await treatmentsService.createTreatment(body<CreateTreatmentInput>(req));
    res.status(201).json(treatment);
  } catch (err) {
    next(err);
  }
});

treatmentsRouter.patch("/:id", requireAdmin, validateBody(updateTreatmentSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    res.json(await treatmentsService.updateTreatment(id, body<UpdateTreatmentInput>(req)));
  } catch (err) {
    next(err);
  }
});
