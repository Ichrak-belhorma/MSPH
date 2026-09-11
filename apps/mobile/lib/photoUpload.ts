import { Platform } from "react-native";
import { File, UploadTask, UploadType } from "expo-file-system";
import { API_BASE_URL, refreshAccessToken } from "./apiClient";
import { getSession } from "./authStore";

export interface UploadedPhoto {
  id: string;
  url: string | null;
}

interface RawUploadResult {
  status: number;
  body: string;
}

/**
 * Real multipart upload of a captured photo to
 * `POST /visits/:id/photos/upload` (see CONTEXT.md "Photo storage" —
 * session 4 added the real storage driver + this endpoint specifically
 * for the mobile app; nothing here fakes success).
 *
 * Two transports, same contract: native platforms use expo-file-system's
 * `UploadTask` (true native multipart streaming + progress, and the only
 * option — `UploadTask` has no web implementation, see its package
 * source). Web uses `XMLHttpRequest` directly (fetch has no upload
 * progress event) — needed because this Expo project also targets web
 * (app.json's `web` block) and was how this whole flow was actually
 * exercised end-to-end in this sandbox (no physical iOS/Android device
 * available to test on — see CONTEXT.md's verification section for what
 * was and wasn't run on real native).
 */
async function attemptNative(visitId: string, localUri: string, caption: string, accessToken: string, onProgress?: (f: number) => void) {
  const file = new File(localUri);
  const task = new UploadTask(file, `${API_BASE_URL}/visits/${visitId}/photos/upload`, {
    httpMethod: "POST",
    uploadType: UploadType.MULTIPART,
    fieldName: "photo",
    mimeType: "image/jpeg",
    parameters: caption ? { caption } : undefined,
    headers: { Authorization: `Bearer ${accessToken}` },
    onProgress: (p) => {
      if (p.totalBytes > 0) onProgress?.(p.bytesSent / p.totalBytes);
    },
  });
  return task.uploadAsync();
}

async function attemptWeb(visitId: string, localUri: string, caption: string, accessToken: string, onProgress?: (f: number) => void): Promise<RawUploadResult> {
  const blob = await fetch(localUri).then((r) => r.blob());
  const form = new FormData();
  form.append("photo", blob, "photo.jpg");
  if (caption) form.append("caption", caption);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}/visits/${visitId}/photos/upload`);
    xhr.setRequestHeader("Authorization", `Bearer ${accessToken}`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => resolve({ status: xhr.status, body: xhr.responseText });
    xhr.onerror = () => reject(new Error("Connexion réseau indisponible"));
    xhr.send(form);
  });
}

export async function uploadVisitPhoto(
  visitId: string,
  localUri: string,
  caption: string,
  onProgress?: (fraction: number) => void,
): Promise<UploadedPhoto> {
  const attempt = Platform.OS === "web" ? attemptWeb : attemptNative;

  const session = getSession();
  if (!session) throw new Error("Aucune session active");

  let result = await attempt(visitId, localUri, caption, session.accessToken, onProgress);

  if (result.status === 401) {
    const freshToken = await refreshAccessToken();
    result = await attempt(visitId, localUri, caption, freshToken, onProgress);
  }

  if (result.status < 200 || result.status >= 300) {
    let message = `Échec de l'envoi (${result.status})`;
    try {
      const parsed = JSON.parse(result.body) as { error?: { message?: string } };
      if (parsed.error?.message) message = parsed.error.message;
    } catch {
      // Non-JSON error body — keep the generic message.
    }
    throw new Error(message);
  }

  const body = JSON.parse(result.body) as { id: string; url: string | null };
  return { id: body.id, url: body.url };
}
