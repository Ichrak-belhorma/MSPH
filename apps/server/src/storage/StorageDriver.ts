/**
 * Storage abstraction boundary — see CONTEXT.md section 5's history: this
 * interface existed only on paper (an env var + a static-file mount)
 * through session 3. Session 4 (mobile photo upload) is the first real
 * implementation, needed because the brief now requires actual uploaded
 * bytes to reach the server rather than a hand-typed metadata reference.
 *
 * Keep this interface the *only* thing callers depend on
 * (`src/storage/index.ts` picks the concrete driver from `STORAGE_DRIVER`)
 * so a future S3/R2 driver (see CONTEXT.md "Next steps") is a new file
 * implementing this, not a rewrite of every call site.
 */
export interface StoredFile {
  /** Opaque key identifying the file within the driver — what's persisted
   * on the `Photo.storageKey` column. Never assume it's a URL path. */
  storageKey: string;
  /** Publicly fetchable URL for the file, if the driver can produce one
   * directly (local + most cloud drivers can; a driver requiring signed,
   * time-limited URLs would return undefined here and a client would ask
   * for a fresh URL some other way — not needed yet, so not built). */
  url: string;
}

export interface SaveFileInput {
  buffer: Buffer;
  /** Original filename from the client, used only to derive a safe
   * extension — never trusted as a path. */
  originalName: string;
  mimeType: string;
}

export interface StorageDriver {
  save(input: SaveFileInput): Promise<StoredFile>;
}
