import { prisma } from "../../lib/prisma.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { hashToken, signAccessToken, signRefreshToken, verifyRefreshToken } from "../../lib/jwt.js";
import { toPublicUser } from "../../lib/serialize.js";
import { ApiError } from "../../middleware/errorHandler.js";
import { logger } from "../../lib/logger.js";

async function issueTokenPair(userId: string, role: "ADMIN" | "WORKER") {
  const accessToken = signAccessToken({ sub: userId, role });
  const refresh = signRefreshToken(userId);
  await prisma.refreshToken.create({
    data: {
      id: refresh.jti,
      userId,
      tokenHash: hashToken(refresh.token),
      expiresAt: refresh.expiresAt,
    },
  });
  return { accessToken, refreshToken: refresh.token };
}

// See the equivalent note in customers.service.ts re: return types not
// being annotated with the shared (string-dates) wire type — applies to
// `login`'s `user` field below.
export async function login(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  // Same error for "no such user" and "wrong password" — don't leak which
  // one it was.
  if (!user || !(await verifyPassword(user.passwordHash, password))) {
    throw ApiError.unauthorized("Invalid email or password");
  }
  if (!user.active) {
    throw ApiError.forbidden("This account has been deactivated");
  }

  const tokens = await issueTokenPair(user.id, user.role);
  return { ...tokens, user: toPublicUser(user) };
}

export async function refresh(token: string): Promise<{ accessToken: string; refreshToken: string }> {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    throw ApiError.unauthorized("Invalid or expired refresh token");
  }

  const stored = await prisma.refreshToken.findUnique({ where: { id: payload.jti } });
  if (!stored || stored.tokenHash !== hashToken(token)) {
    throw ApiError.unauthorized("Invalid refresh token");
  }

  if (stored.revokedAt) {
    // A previously-rotated-away token was presented again — either a
    // client race (harmless) or the token was stolen and both the
    // legitimate owner and an attacker are now racing to use it. We can't
    // tell which, so treat it as a compromise: kill every refresh token
    // for this user, forcing a fresh login everywhere.
    await prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    logger.warn("Refresh token reuse detected — revoked all sessions for user", { userId: stored.userId });
    throw ApiError.unauthorized("Refresh token has already been used");
  }

  if (stored.expiresAt < new Date()) {
    throw ApiError.unauthorized("Refresh token has expired");
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user || !user.active) {
    throw ApiError.unauthorized("Account is no longer active");
  }

  // Rotate: revoke the presented token and issue a brand new pair.
  await prisma.refreshToken.update({ where: { id: stored.id }, data: { revokedAt: new Date() } });
  return issueTokenPair(user.id, user.role);
}

export async function logout(token: string): Promise<void> {
  let payload;
  try {
    payload = verifyRefreshToken(token);
  } catch {
    // Already invalid/expired — logging out "succeeds" either way, there
    // is nothing left to revoke.
    return;
  }
  await prisma.refreshToken.updateMany({
    where: { id: payload.jti, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw ApiError.notFound("User");

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw ApiError.unauthorized("Current password is incorrect");
  }

  const passwordHash = await hashPassword(newPassword);
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
    // Changing your password should end every other session.
    prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
}
