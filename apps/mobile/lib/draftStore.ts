import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Local, per-visit draft persistence — the "offline considerations"
 * minimum from the brief: a worker's typed remarks and captured photos
 * must survive a dropped connection, an interrupted upload, or the app
 * being backgrounded/killed mid-visit, without a full offline
 * sync/queue system (explicitly out of scope for this stage — see
 * CONTEXT.md "Mobile application" for the documented approach and why it
 * stops here).
 *
 * Uses `@react-native-async-storage/async-storage` (plain on-device
 * storage — fine here, nothing in a draft is a credential; contrast with
 * lib/secureStorage.ts for the refresh token). Each visit gets one JSON
 * blob keyed by its id. Photos are stored as {localUri, caption, status}
 * — the local URI from the camera/picker, not the bytes themselves — so
 * a photo a worker took is never silently lost even if its upload never
 * completes; it just sits there as "failed"/"pending" until retried, and
 * the draft is only cleared once the visit is actually completed
 * server-side.
 *
 * This is NOT a general offline queue: if the app never reopens the
 * screen again, an interrupted upload just stays failed until the worker
 * comes back to it. Good enough for "don't lose work", not a promise of
 * eventual background sync.
 */

export type DraftPhotoStatus = "pending" | "uploading" | "uploaded" | "failed";

export interface DraftPhoto {
  /** Stable local id (not the server's) so the UI can key/update a photo
   * before (or without) a successful upload. */
  localId: string;
  localUri: string;
  caption: string;
  status: DraftPhotoStatus;
  /** 0-1 while status is "uploading" — drives the progress bar. */
  uploadProgress?: number;
  /** Set once uploaded — the real Photo.id from the server. */
  remoteId?: string;
  remoteUrl?: string;
  error?: string;
}

export interface VisitDraft {
  observations: string;
  remarks: string;
  condition: string;
  photos: DraftPhoto[];
  /** caseTreatmentId -> notes typed but not yet submitted */
  treatmentNotes: Record<string, string>;
  updatedAt: string;
}

const EMPTY_DRAFT: VisitDraft = {
  observations: "",
  remarks: "",
  condition: "",
  photos: [],
  treatmentNotes: {},
  updatedAt: new Date(0).toISOString(),
};

function keyFor(visitId: string): string {
  return `msph.draft.visit.${visitId}`;
}

export async function loadDraft(visitId: string): Promise<VisitDraft> {
  try {
    const raw = await AsyncStorage.getItem(keyFor(visitId));
    if (!raw) return { ...EMPTY_DRAFT };
    return { ...EMPTY_DRAFT, ...(JSON.parse(raw) as Partial<VisitDraft>) };
  } catch {
    return { ...EMPTY_DRAFT };
  }
}

export async function saveDraft(visitId: string, draft: VisitDraft): Promise<void> {
  try {
    await AsyncStorage.setItem(keyFor(visitId), JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
  } catch {
    // Best-effort — losing the persisted copy of a draft that's still in
    // memory (the screen holding it) isn't fatal, just less resilient.
  }
}

export async function clearDraft(visitId: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(keyFor(visitId));
  } catch {
    // Ignore.
  }
}
