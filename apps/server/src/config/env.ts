import "dotenv/config";
import { z } from "zod";

/**
 * All server configuration is validated once at boot. Fail fast and loud
 * instead of limping along with `undefined` secrets.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(4000),
  /** Comma-separated list — the desktop Vite dev server, Expo web, a
   * packaged Electron app's custom scheme, etc. can all be different
   * origins in dev. Native mobile fetch calls don't send an Origin header
   * at all and are unaffected by this (see app.ts). */
  CLIENT_ORIGIN: z.string().default("http://localhost:5173"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

  JWT_ACCESS_SECRET: z.string().min(16, "JWT_ACCESS_SECRET must be at least 16 characters"),
  JWT_REFRESH_SECRET: z.string().min(16, "JWT_REFRESH_SECRET must be at least 16 characters"),
  JWT_ACCESS_TTL: z.string().default("15m"),
  JWT_REFRESH_TTL: z.string().default("30d"),

  STORAGE_DRIVER: z.enum(["local"]).default("local"),
  STORAGE_LOCAL_ROOT: z.string().default("./storage/uploads"),
  STORAGE_PUBLIC_URL: z.string().default("http://localhost:4000/uploads"),
});

function loadEnv() {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    throw new Error("Server cannot start with invalid environment configuration. See .env.example.");
  }
  return parsed.data;
}

export const env = loadEnv();
export const isProduction = env.NODE_ENV === "production";

/** `CLIENT_ORIGIN` split into a list — see the schema comment above. */
export const clientOrigins: string[] = env.CLIENT_ORIGIN.split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);
