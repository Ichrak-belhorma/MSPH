import { env } from "../config/env.js";
import { LocalStorageDriver } from "./localStorageDriver.js";
import { S3StorageDriver } from "./s3StorageDriver.js";
import type { StorageDriver } from "./StorageDriver.js";

export type { SaveFileInput, StorageDriver, StoredFile } from "./StorageDriver.js";

const S3_REQUIRED_VARS = ["STORAGE_BUCKET", "STORAGE_ACCESS_KEY", "STORAGE_SECRET_KEY"] as const;

/** `STORAGE_DRIVER=local` (dev default) writes to disk — fine for one
 * machine, gone on every redeploy/restart of the platforms in the
 * deployment doc. `STORAGE_DRIVER=s3` covers AWS S3, Cloudflare R2,
 * Backblaze B2, Supabase Storage, or a self-hosted MinIO — see
 * s3StorageDriver.ts. Same fail-fast philosophy as config/env.ts: a
 * missing S3 credential is a startup error naming exactly what's absent,
 * not a mysterious 500 the first time a worker uploads a photo. */
function createStorageDriver(): StorageDriver {
  switch (env.STORAGE_DRIVER) {
    case "s3": {
      const missing = S3_REQUIRED_VARS.filter((key) => !env[key]);
      if (missing.length > 0) {
        throw new Error(
          `STORAGE_DRIVER=s3 requires ${missing.join(", ")} to be set. See .env.example "File storage".`,
        );
      }
      return new S3StorageDriver();
    }
    case "local":
    default:
      return new LocalStorageDriver();
  }
}

export const storageDriver: StorageDriver = createStorageDriver();
