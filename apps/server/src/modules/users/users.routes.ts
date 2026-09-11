import { Router } from "express";
import { createUserSchema, cuidSchema, updateUserSchema, userListQuerySchema } from "@msph/shared";
import type { CreateUserInput, UpdateUserInput, UserListQuery } from "@msph/shared";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { body, query, validateBody, validateQuery } from "../../middleware/validate.js";
import * as usersService from "./users.service.js";

/** Admin-only worker/admin account management — see the brief's "Admin:
 * manage workers" permission. There is no self-registration endpoint. */
export const usersRouter = Router();

usersRouter.use(requireAuth, requireAdmin);

usersRouter.get("/", validateQuery(userListQuerySchema), async (req, res, next) => {
  try {
    res.json(await usersService.listUsers(query<UserListQuery>(req)));
  } catch (err) {
    next(err);
  }
});

usersRouter.post("/", validateBody(createUserSchema), async (req, res, next) => {
  try {
    const user = await usersService.createUser(body<CreateUserInput>(req));
    res.status(201).json(user);
  } catch (err) {
    next(err);
  }
});

usersRouter.get("/:id", async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    res.json(await usersService.getUser(id));
  } catch (err) {
    next(err);
  }
});

usersRouter.patch("/:id", validateBody(updateUserSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    const user = await usersService.updateUser(id, req.user!.id, body<UpdateUserInput>(req));
    res.json(user);
  } catch (err) {
    next(err);
  }
});
