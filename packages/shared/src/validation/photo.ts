import { z } from "zod";
import { optionalString } from "./common.js";

/**
 * Body for POST /visits/:id/photos.
 *
 * Metadata-only, per the brief's item 13 ("Photos metadata") and the
 * storage-abstraction decision recorded in CONTEXT.md section 5: no
 * storage driver/binary upload endpoint exists yet, so this endpoint
 * registers a photo that was already stored elsewhere (or, in dev, a key
 * the client made up) — it does not accept multipart file data. The
 * caseId is derived server-side from the visit, not accepted here, so a
 * caller can't attach a photo to a case other than the one the visit
 * belongs to.
 */
export const addVisitPhotoSchema = z.object({
  storageKey: z.string().trim().min(1, "storageKey is required").max(512),
  url: z.string().trim().url().optional(),
  caption: optionalString(300),
});
export type AddVisitPhotoInput = z.infer<typeof addVisitPhotoSchema>;
