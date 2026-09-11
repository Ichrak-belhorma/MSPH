import { z } from "zod";
import { optionalString } from "./common.js";

/** Metadata sent alongside a multipart photo upload — the binary itself is
 * a separate multipart field handled by the storage layer, see
 * apps/server/src/storage. */
export const uploadPhotoMetaSchema = z.object({
  caseId: z.string().cuid(),
  visitId: z.string().cuid().optional(),
  caption: optionalString(300),
});
export type UploadPhotoMetaInput = z.infer<typeof uploadPhotoMetaSchema>;
