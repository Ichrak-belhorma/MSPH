import argon2 from "argon2";

/** Argon2id (argon2's own default) — the currently recommended password
 * hash, stronger against GPU cracking than bcrypt at equivalent cost. */
export function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain);
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    // Malformed/foreign hash (shouldn't happen since we control every
    // hash we ever store) — treat as "does not match" rather than crash.
    return false;
  }
}
