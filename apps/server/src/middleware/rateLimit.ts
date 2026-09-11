import rateLimit from "express-rate-limit";

/**
 * Applied to POST /auth/login and /auth/refresh — the two endpoints an
 * attacker would hit to brute-force credentials or grind through stolen
 * refresh tokens. Keyed by IP (express-rate-limit's default); generous
 * enough that a real user mistyping a password a few times never notices,
 * tight enough to blunt automated guessing.
 */
export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: { message: "Too many attempts. Please try again later.", code: "RATE_LIMITED" },
  },
});
