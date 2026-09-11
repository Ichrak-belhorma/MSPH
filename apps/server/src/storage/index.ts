import { env } from "../config/env.js";
import { LocalStorageDriver } from "./localStorageDriver.js";
import type { StorageDriver } from "./StorageDriver.js";

export type { SaveFileInput, StorageDriver, StoredFile } from "./StorageDriver.js";

/** `STORAGE_DRIVER` only has one valid value today (`local`, see
 * config/env.ts) — this switch exists so adding `"s3"` later is a one-line
 * change here plus a new driver file, not a hunt through every call site. */
function createStorageDriver(): StorageDriver {
  switch (env.STORAGE_DRIVER) {
    case "local":
    default:
      return new LocalStorageDriver();
  }
}

export const storageDriver: StorageDriver = createStorageDriver();
