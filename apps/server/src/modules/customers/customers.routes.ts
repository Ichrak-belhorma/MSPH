import { Router } from "express";
import { createCustomerSchema, cuidSchema, peopleListQuerySchema, updateCustomerSchema } from "@msph/shared";
import type { CreateCustomerInput, PeopleListQuery, UpdateCustomerInput } from "@msph/shared";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { body, query, validateBody, validateQuery } from "../../middleware/validate.js";
import * as customersService from "./customers.service.js";

/**
 * Admin-only, per CONTEXT.md: workers get "relevant customer/property
 * information" through the case detail response (`GET /cases/:id`
 * embeds customer + property + landlord), not through standalone CRUD on
 * these resources — narrower permissions, no separate access-control
 * check needed per record.
 */
export const customersRouter = Router();

customersRouter.use(requireAuth, requireAdmin);

customersRouter.get("/", validateQuery(peopleListQuerySchema), async (req, res, next) => {
  try {
    res.json(await customersService.listCustomers(query<PeopleListQuery>(req)));
  } catch (err) {
    next(err);
  }
});

customersRouter.post("/", validateBody(createCustomerSchema), async (req, res, next) => {
  try {
    const customer = await customersService.createCustomer(body<CreateCustomerInput>(req));
    res.status(201).json(customer);
  } catch (err) {
    next(err);
  }
});

customersRouter.get("/:id", async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    res.json(await customersService.getCustomer(id));
  } catch (err) {
    next(err);
  }
});

customersRouter.patch("/:id", validateBody(updateCustomerSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    res.json(await customersService.updateCustomer(id, body<UpdateCustomerInput>(req)));
  } catch (err) {
    next(err);
  }
});
