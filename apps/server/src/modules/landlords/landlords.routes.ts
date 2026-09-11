import { Router } from "express";
import { createLandlordSchema, cuidSchema, peopleListQuerySchema, updateLandlordSchema } from "@msph/shared";
import type { CreateLandlordInput, PeopleListQuery, UpdateLandlordInput } from "@msph/shared";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { body, query, validateBody, validateQuery } from "../../middleware/validate.js";
import * as landlordsService from "./landlords.service.js";

/** Admin-only — same rationale as customersRouter. Brief's example
 * endpoint list only shows GET/POST for landlords; GET /:id and PATCH
 * are added here for REST consistency with customers/properties (an
 * admin needs to edit a landlord's phone/email eventually) — documented
 * deviation, see CONTEXT.md. */
export const landlordsRouter = Router();

landlordsRouter.use(requireAuth, requireAdmin);

landlordsRouter.get("/", validateQuery(peopleListQuerySchema), async (req, res, next) => {
  try {
    res.json(await landlordsService.listLandlords(query<PeopleListQuery>(req)));
  } catch (err) {
    next(err);
  }
});

landlordsRouter.post("/", validateBody(createLandlordSchema), async (req, res, next) => {
  try {
    const landlord = await landlordsService.createLandlord(body<CreateLandlordInput>(req));
    res.status(201).json(landlord);
  } catch (err) {
    next(err);
  }
});

landlordsRouter.get("/:id", async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    res.json(await landlordsService.getLandlord(id));
  } catch (err) {
    next(err);
  }
});

landlordsRouter.patch("/:id", validateBody(updateLandlordSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    res.json(await landlordsService.updateLandlord(id, body<UpdateLandlordInput>(req)));
  } catch (err) {
    next(err);
  }
});
