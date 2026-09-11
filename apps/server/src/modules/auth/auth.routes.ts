import { Router } from "express";
import { changePasswordSchema, loginSchema, refreshTokenSchema } from "@msph/shared";
import type { ChangePasswordInput, LoginInput, RefreshTokenInput } from "@msph/shared";
import { requireAuth } from "../../middleware/auth.js";
import { authRateLimiter } from "../../middleware/rateLimit.js";
import { body, validateBody } from "../../middleware/validate.js";
import * as authService from "./auth.service.js";

export const authRouter = Router();

authRouter.post("/login", authRateLimiter, validateBody(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = body<LoginInput>(req);
    const result = await authService.login(email, password);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/refresh", authRateLimiter, validateBody(refreshTokenSchema), async (req, res, next) => {
  try {
    const { refreshToken } = body<RefreshTokenInput>(req);
    const result = await authService.refresh(refreshToken);
    res.status(200).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post("/logout", validateBody(refreshTokenSchema), async (req, res, next) => {
  try {
    const { refreshToken } = body<RefreshTokenInput>(req);
    await authService.logout(refreshToken);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

authRouter.post("/change-password", requireAuth, validateBody(changePasswordSchema), async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = body<ChangePasswordInput>(req);
    await authService.changePassword(req.user!.id, currentPassword, newPassword);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
