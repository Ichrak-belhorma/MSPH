import { useEffect, useState } from "react";
import { Alert, Image, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { router, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { BigButton, ScreenLoading, SectionTitle, TextField } from "@/components/ui";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { loadDraft, saveDraft, type DraftPhoto } from "@/lib/draftStore";
import { uploadVisitPhoto } from "@/lib/photoUpload";
import { queryKeys } from "@/api/queryKeys";
import { COLORS, RADIUS, SPACING } from "@/lib/theme";

function newLocalId(): string {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Photo capture — camera, multiple photos, preview, delete before upload,
 * optional caption per photo, then a real upload with per-photo progress
 * and retry (see CONTEXT.md "Photo storage"). Photos accumulate locally
 * first (status "pending") so a worker can review/caption/discard before
 * anything is sent — matches the brief's explicit ordering ("preview,
 * delete before upload") and the fact the backend has no endpoint to
 * edit/delete a photo after upload, so getting it right before sending
 * matters more here than on the desktop.
 */
export default function PhotoCaptureScreen() {
  const { id: visitId } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [photos, setPhotos] = useState<DraftPhoto[] | null>(null);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  useEffect(() => {
    void loadDraft(visitId).then((draft) => setPhotos(draft.photos));
  }, [visitId]);

  async function persist(next: DraftPhoto[]) {
    setPhotos(next);
    const draft = await loadDraft(visitId);
    await saveDraft(visitId, { ...draft, photos: next });
  }

  async function addFromCamera() {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Accès caméra refusé", "Autorisez l'accès à la caméra dans les réglages du téléphone pour prendre des photos.");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ mediaTypes: ["images"], quality: 0.6 });
    if (result.canceled || !photos) return;
    const additions: DraftPhoto[] = result.assets.map((a) => ({ localId: newLocalId(), localUri: a.uri, caption: "", status: "pending" }));
    await persist([...photos, ...additions]);
  }

  async function addFromLibrary() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Accès aux photos refusé", "Autorisez l'accès aux photos dans les réglages du téléphone.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 0.6, allowsMultipleSelection: true });
    if (result.canceled || !photos) return;
    const additions: DraftPhoto[] = result.assets.map((a) => ({ localId: newLocalId(), localUri: a.uri, caption: "", status: "pending" }));
    await persist([...photos, ...additions]);
  }

  async function removePhoto(localId: string) {
    if (!photos) return;
    await persist(photos.filter((p) => p.localId !== localId));
  }

  async function updateCaption(localId: string, caption: string) {
    if (!photos) return;
    await persist(photos.map((p) => (p.localId === localId ? { ...p, caption } : p)));
  }

  async function uploadOne(photo: DraftPhoto) {
    if (!photos) return;
    const setStatus = async (patch: Partial<DraftPhoto>) => {
      setPhotos((prev) => (prev ? prev.map((p) => (p.localId === photo.localId ? { ...p, ...patch } : p)) : prev));
    };
    await setStatus({ status: "uploading", error: undefined });
    try {
      const uploaded = await uploadVisitPhoto(visitId, photo.localUri, photo.caption, (fraction) => {
        void setStatus({ uploadProgress: fraction });
      });
      const current = await loadDraft(visitId);
      const next = current.photos.map((p) =>
        p.localId === photo.localId ? { ...p, status: "uploaded" as const, remoteId: uploaded.id, remoteUrl: uploaded.url ?? undefined } : p,
      );
      await persist(next);
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.all() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.visits.all() });
    } catch (err) {
      const current = await loadDraft(visitId);
      const next = current.photos.map((p) =>
        p.localId === photo.localId ? { ...p, status: "failed" as const, error: err instanceof Error ? err.message : "Échec de l'envoi" } : p,
      );
      await persist(next);
    }
  }

  async function uploadAllPending() {
    if (!photos) return;
    // Sequential, not parallel — a weak field connection shouldn't be
    // asked to carry several simultaneous photo uploads (brief: "respect
    // mobile network limitations").
    for (const photo of photos) {
      if (photo.status === "pending" || photo.status === "failed") {
        // eslint-disable-next-line no-await-in-loop
        await uploadOne(photo);
      }
    }
  }

  if (!photos) return <ScreenLoading label="Chargement des photos…" />;

  const pendingCount = photos.filter((p) => p.status === "pending" || p.status === "failed").length;

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.captureRow}>
          <View style={{ flex: 1 }}>
            <BigButton label="📷 Prendre une photo" onPress={() => void addFromCamera()} />
          </View>
        </View>
        <Pressable onPress={() => void addFromLibrary()} style={styles.libraryLink}>
          <Text style={styles.libraryLinkText}>Choisir depuis la galerie</Text>
        </Pressable>

        {photos.length === 0 ? (
          <Text style={styles.empty}>Aucune photo pour l'instant.</Text>
        ) : (
          <View style={{ marginTop: SPACING.lg }}>
            <SectionTitle>Photos ({photos.length})</SectionTitle>
            {photos.map((photo) => (
              <PhotoRow
                key={photo.localId}
                photo={photo}
                onPreview={() => setLightboxUri(photo.localUri)}
                onDelete={() => void removePhoto(photo.localId)}
                onCaptionChange={(text) => void updateCaption(photo.localId, text)}
                onRetry={() => void uploadOne(photo)}
              />
            ))}
          </View>
        )}
      </ScrollView>

      <View style={styles.footer}>
        <BigButton
          label={pendingCount > 0 ? `Envoyer les photos (${pendingCount})` : "Terminer"}
          tone={pendingCount > 0 ? "primary" : "neutral"}
          onPress={pendingCount > 0 ? () => void uploadAllPending() : () => router.back()}
        />
      </View>

      <PhotoLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </View>
  );
}

function PhotoRow({
  photo,
  onPreview,
  onDelete,
  onCaptionChange,
  onRetry,
}: {
  photo: DraftPhoto;
  onPreview: () => void;
  onDelete: () => void;
  onCaptionChange: (text: string) => void;
  onRetry: () => void;
}) {
  const canEdit = photo.status === "pending" || photo.status === "failed";
  return (
    <View style={styles.photoRow}>
      <Pressable onPress={onPreview}>
        <Image source={{ uri: photo.localUri }} style={styles.thumb} />
      </Pressable>
      <View style={{ flex: 1 }}>
        {canEdit ? (
          <TextField placeholder="Légende (optionnel)" value={photo.caption} onChangeText={onCaptionChange} style={styles.captionInput} />
        ) : photo.caption ? (
          <Text style={styles.captionText}>{photo.caption}</Text>
        ) : null}
        <PhotoStatus photo={photo} onRetry={onRetry} />
      </View>
      {canEdit && (
        <Pressable onPress={onDelete} style={styles.deleteButton}>
          <Text style={styles.deleteButtonText}>Supprimer</Text>
        </Pressable>
      )}
    </View>
  );
}

function PhotoStatus({ photo, onRetry }: { photo: DraftPhoto; onRetry: () => void }) {
  if (photo.status === "pending") return <Text style={styles.statusPending}>En attente d'envoi</Text>;
  if (photo.status === "uploading") {
    const pct = photo.uploadProgress !== undefined ? ` ${Math.round(photo.uploadProgress * 100)}%` : "";
    return <Text style={styles.statusUploading}>Envoi en cours…{pct}</Text>;
  }
  if (photo.status === "uploaded") return <Text style={styles.statusUploaded}>✓ Envoyée</Text>;
  return (
    <View>
      <Text style={styles.statusFailed}>Échec — {photo.error ?? "réessayez"}</Text>
      <Pressable onPress={onRetry} style={styles.retryLink}>
        <Text style={styles.retryLinkText}>Réessayer</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  captureRow: { flexDirection: "row" },
  libraryLink: { alignItems: "center", paddingVertical: SPACING.md },
  libraryLinkText: { color: COLORS.primary, fontWeight: "600", fontSize: 14 },
  empty: { color: COLORS.textMuted, textAlign: "center", marginTop: SPACING.xl },
  photoRow: {
    flexDirection: "row",
    gap: SPACING.md,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.sm,
    marginBottom: SPACING.sm,
    alignItems: "flex-start",
  },
  thumb: { width: 64, height: 64, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  captionInput: { minHeight: 40, fontSize: 13, paddingVertical: SPACING.xs, marginBottom: 0 },
  captionText: { fontSize: 13, color: COLORS.text, marginBottom: SPACING.xs },
  deleteButton: { paddingHorizontal: SPACING.sm, paddingVertical: SPACING.xs },
  deleteButtonText: { color: COLORS.danger, fontSize: 12, fontWeight: "700" },
  statusPending: { fontSize: 12, color: COLORS.textMuted, marginTop: SPACING.xs },
  statusUploading: { fontSize: 12, color: COLORS.info, marginTop: SPACING.xs, fontWeight: "600" },
  statusUploaded: { fontSize: 12, color: COLORS.success, marginTop: SPACING.xs, fontWeight: "700" },
  statusFailed: { fontSize: 12, color: COLORS.danger, marginTop: SPACING.xs, fontWeight: "600" },
  retryLink: { marginTop: 2 },
  retryLinkText: { fontSize: 12, color: COLORS.primary, fontWeight: "700" },
  footer: { padding: SPACING.lg, borderTopWidth: 1, borderTopColor: COLORS.border, backgroundColor: COLORS.surface },
});
