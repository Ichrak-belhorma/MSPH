import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { toPublicUser } from "../../lib/serialize.js";
import { requireAuth } from "../../middleware/auth.js";
import { ApiError } from "../../middleware/errorHandler.js";

export const meRouter = Router();

meRouter.get("/", requireAuth, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw ApiError.notFound("User");
    res.json(toPublicUser(user));
  } catch (err) {
    next(err);
  }
});
