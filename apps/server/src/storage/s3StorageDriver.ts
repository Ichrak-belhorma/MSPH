import { randomUUID } from "node:crypto";
import path from "node:path";
import { PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { env } from "../config/env.js";
import type { SaveFileInput, StorageDriver, StoredFile } from "./StorageDriver.js";

const SAFE_EXTENSION = /^[a-z0-9]{1,8}$/i;

/** Same rule as localStorageDriver.ts — never trust the client-supplied
 * filename as anything but a hint for the extension. */
function extensionFor(originalName: string, mimeType: string): string {
  const fromName = path.extname(originalName).replace(".", "");
  if (SAFE_EXTENSION.test(fromName)) return fromName.toLowerCase();
  const fromMime = mimeType.split("/")[1];
  if (fromMime && SAFE_EXTENSION.test(fromMime)) return fromMime.toLowerCase();
  return "bin";
}

/**
 * Any S3-compatible object store: real AWS S3, Cloudflare R2, Backblaze
 * B2, Supabase Storage's S3-compatible endpoint, or a self-hosted MinIO —
 * all speak the same `PutObjectCommand` API, so one driver covers every
 * provider in the deployment doc. Selected via `STORAGE_DRIVER=s3` (see
 * config/env.ts + storage/index.ts, which validates the vars below are
 * all present before this class is even constructed).
 *
 * Mirrors localStorageDriver.ts's behavior exactly (random UUID key,
 * extension derived safely from the original name/mimetype, never the
 * client-supplied name itself) so swapping drivers changes nothing about
 * what `Photo.storageKey` looks like or how it's derived — only where the
 * bytes physically live.
 */
export class S3StorageDriver implements StorageDriver {
  private readonly client: S3Client;
  private readonly bucket: string;
  private readonly publicUrlBase: string;

  constructor() {
    // storage/index.ts already asserts these are set before constructing
    // this driver — the `!`s here are that contract, not an unchecked
    // assumption.
    this.bucket = env.STORAGE_BUCKET!;
    this.client = new S3Client({
      region: env.STORAGE_REGION || "auto",
      endpoint: env.STORAGE_ENDPOINT,
      forcePathStyle: env.STORAGE_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: env.STORAGE_ACCESS_KEY!,
        secretAccessKey: env.STORAGE_SECRET_KEY!,
      },
    });
    // A CDN/custom domain in front of the bucket, if configured;
    // otherwise fall back to a direct URL built from the endpoint (R2/
    // MinIO/self-hosted — bucket-as-path-segment) or AWS's own
    // virtual-hosted-style bucket URL. Good enough as a default for a
    // bucket actually configured for public read; a private bucket
    // needing signed URLs is a documented follow-up (see this file's
    // module-level note in storage/index.ts), not built here.
    this.publicUrlBase =
      env.STORAGE_PUBLIC_URL_BASE ||
      (env.STORAGE_ENDPOINT
        ? `${env.STORAGE_ENDPOINT.replace(/\/$/, "")}/${this.bucket}`
        : `https://${this.bucket}.s3.${env.STORAGE_REGION || "us-east-1"}.amazonaws.com`);
  }

  async save(input: SaveFileInput): Promise<StoredFile> {
    const storageKey = `${randomUUID()}.${extensionFor(input.originalName, input.mimeType)}`;

    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
        Body: input.buffer,
        ContentType: input.mimeType,
      }),
    );

    return {
      storageKey,
      url: `${this.publicUrlBase}/${storageKey}`,
    };
  }
}
