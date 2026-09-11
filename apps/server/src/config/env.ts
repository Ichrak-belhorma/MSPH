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

  /** `"local"` (default, dev-friendly — writes to disk, see
   * storage/localStorageDriver.ts) or `"s3"` (any S3-compatible object
   * store — AWS S3, Cloudflare R2, Backblaze B2, MinIO, Supabase Storage's
   * S3-compatible endpoint — see storage/s3StorageDriver.ts). Production
   * should use `"s3"`: a container's local disk is ephemeral on every
   * platform in the deployment doc (a redeploy/restart loses everything
   * under STORAGE_LOCAL_ROOT), and doesn't survive more than one replica
   * either way. */
  STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_ROOT: z.string().default("./storage/uploads"),
  STORAGE_PUBLIC_URL: z.string().default("http://localhost:4000/uploads"),

  /** Only read/required when STORAGE_DRIVER=s3 — validated together in
   * storage/index.ts (one clear startup error naming every missing var,
   * not a cryptic AWS SDK failure the first time a photo is uploaded). */
  STORAGE_BUCKET: z.string().optional(),
  STORAGE_REGION: z.string().optional(),
  /** Required for R2/B2/MinIO/Supabase (all S3-compatible but not AWS
   * itself); leave unset for real AWS S3, which derives its endpoint from
   * STORAGE_REGION. */
  STORAGE_ENDPOINT: z.string().optional(),
  STORAGE_ACCESS_KEY: z.string().optional(),
  STORAGE_SECRET_KEY: z.string().optional(),
  /** R2/MinIO/most non-AWS S3-compatible providers need path-style
   * requests (`endpoint/bucket/key`) rather than AWS's default
   * virtual-hosted style (`bucket.endpoint/key`). */
  STORAGE_FORCE_PATH_STYLE: z.coerce.boolean().default(false),
  /** Optional override for the public URL prefix a stored object is
   * served from — a CDN/custom domain fronting the bucket (e.g.
   * `https://cdn.your-domain.com`) rather than the bucket's own
   * (sometimes not even public) endpoint. Falls back to a direct
   * bucket/endpoint URL when unset — see s3StorageDriver.ts. */
  STORAGE_PUBLIC_URL_BASE: z.string().optional(),
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
