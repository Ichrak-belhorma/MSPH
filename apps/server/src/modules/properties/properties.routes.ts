import { Router } from "express";
import { createPropertySchema, cuidSchema, peopleListQuerySchema, updatePropertySchema } from "@msph/shared";
import type { CreatePropertyInput, PeopleListQuery, UpdatePropertyInput } from "@msph/shared";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { body, query, validateBody, validateQuery } from "../../middleware/validate.js";
import * as propertiesService from "./properties.service.js";

/** Admin-only — same rationale as customersRouter. */
export const propertiesRouter = Router();

propertiesRouter.use(requireAuth, requireAdmin);

propertiesRouter.get("/", validateQuery(peopleListQuerySchema), async (req, res, next) => {
  try {
    res.json(await propertiesService.listProperties(query<PeopleListQuery>(req)));
  } catch (err) {
    next(err);
  }
});

propertiesRouter.post("/", validateBody(createPropertySchema), async (req, res, next) => {
  try {
    const property = await propertiesService.createProperty(body<CreatePropertyInput>(req));
    res.status(201).json(property);
  } catch (err) {
    next(err);
  }
});

propertiesRouter.get("/:id", async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    res.json(await propertiesService.getProperty(id));
  } catch (err) {
    next(err);
  }
});

propertiesRouter.patch("/:id", validateBody(updatePropertySchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    res.json(await propertiesService.updateProperty(id, body<UpdatePropertyInput>(req)));
  } catch (err) {
    next(err);
  }
});
