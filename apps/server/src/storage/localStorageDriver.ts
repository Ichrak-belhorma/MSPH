import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "../config/env.js";
import type { SaveFileInput, StorageDriver, StoredFile } from "./StorageDriver.js";

const SAFE_EXTENSION = /^[a-z0-9]{1,8}$/i;

/** Derives a safe extension from the original filename (falls back to a
 * generic one) — never uses any other part of the client-supplied name,
 * so nothing from it reaches the filesystem path. */
function extensionFor(originalName: string, mimeType: string): string {
  const fromName = path.extname(originalName).replace(".", "");
  if (SAFE_EXTENSION.test(fromName)) return fromName.toLowerCase();
  const fromMime = mimeType.split("/")[1];
  if (fromMime && SAFE_EXTENSION.test(fromMime)) return fromMime.toLowerCase();
  return "bin";
}

/**
 * Writes uploaded files to disk under `STORAGE_LOCAL_ROOT`, served back by
 * `app.ts`'s `express.static("/uploads", ...)` mount. Fine for a single
 * dev/small-deployment server; not meant to survive a multi-instance
 * deployment (see CONTEXT.md — swap for an S3/R2 driver at that point,
 * the `StorageDriver` interface is exactly the seam for it).
 */
export class LocalStorageDriver implements StorageDriver {
  async save(input: SaveFileInput): Promise<StoredFile> {
    await mkdir(env.STORAGE_LOCAL_ROOT, { recursive: true });
    const filename = `${randomUUID()}.${extensionFor(input.originalName, input.mimeType)}`;
    const fullPath = path.join(env.STORAGE_LOCAL_ROOT, filename);
    await writeFile(fullPath, input.buffer);
    return {
      storageKey: filename,
      url: `${env.STORAGE_PUBLIC_URL}/${filename}`,
    };
  }
}
