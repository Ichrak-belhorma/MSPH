import { useEffect, useState } from "react";
import { Alert, Image, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useVisitQuery, useCompleteVisitMutation } from "@/api/visits";
import { useCaseQuery } from "@/api/cases";
import { BigButton, Card, EmptyState, ErrorBanner, Pill, ScreenLoading, SectionTitle } from "@/components/ui";
import { ApiRequestError, NetworkError } from "@/lib/apiClient";
import { clearDraft, loadDraft, type VisitDraft } from "@/lib/draftStore";
import { formatDateTime } from "@/lib/format";
import { COLORS, RADIUS, SPACING } from "@/lib/theme";

/**
 * Complete Visit — the brief's explicit requirement: "Before completing:
 * photos, observations, remarks should be visible/reviewable." Read-only
 * review of everything recorded this visit, then one confirm action.
 * Whatever's in the local draft (lib/draftStore) is sent along with the
 * completion request even if the standalone "Enregistrer" on the
 * Inspection screen was never tapped or failed — so finishing here never
 * loses text a worker typed, even if an earlier save silently didn't
 * happen. Draft is cleared only after the server confirms completion.
 */
export default function CompleteVisitScreen() {
  const { id: visitId } = useLocalSearchParams<{ id: string }>();
  const visitQuery = useVisitQuery(visitId);
  const caseQuery = useCaseQuery(visitQuery.data?.caseId);
  const mutation = useCompleteVisitMutation(visitQuery.data?.caseId);
  const [draft, setDraft] = useState<VisitDraft | null>(null);

  useEffect(() => {
    void loadDraft(visitId).then(setDraft);
  }, [visitId]);

  if (visitQuery.isLoading || !draft) return <ScreenLoading label="Chargement…" />;
  if (!visitQuery.data) return <ErrorBanner message="Visite introuvable." />;

  const visit = visitQuery.data;
  const observations = draft.observations || visit.inspection?.observations || "";
  const condition = draft.condition || visit.inspection?.condition || "";
  const remarks = draft.remarks || visit.inspection?.remarks || "";

  const uploadedPhotos = caseQuery.data?.photos.filter((p) => p.visitId === visit.id) ?? [];
  const pendingPhotos = draft.photos.filter((p) => p.status !== "uploaded");

  function doComplete() {
    mutation.mutate(
      { id: visitId, input: { observations: observations || undefined, condition: condition || undefined, remarks: remarks || undefined } },
      {
        onSuccess: async () => {
          // Navigate straight back to Today rather than gating it behind
          // an Alert's OK button: a worker who just finished a visit
          // wants to see their list again immediately, not one more tap
          // — and Alert's onPress callback isn't guaranteed to fire in
          // every RN host (notably react-native-web, where Alert.alert
          // is a no-op), so critical navigation shouldn't depend on it.
          await clearDraft(visitId);
          router.replace("/");
        },
      },
    );
  }

  function handleComplete() {
    if (pendingPhotos.length > 0) {
      Alert.alert(
        "Photos non envoyées",
        `${pendingPhotos.length} photo(s) n'ont pas encore été envoyées. Terminer la visite quand même ?`,
        [
          { text: "Annuler", style: "cancel" },
          { text: "Aller aux photos", onPress: () => router.push(`/visit/${visitId}/photos`) },
          { text: "Terminer quand même", style: "destructive", onPress: doComplete },
        ],
      );
      return;
    }
    doComplete();
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.scheduled}>{formatDateTime(visit.scheduledAt)}</Text>

      <Card>
        <SectionTitle>État constaté</SectionTitle>
        <Text style={styles.value}>{condition || "—"}</Text>
      </Card>
      <Card>
        <SectionTitle>Observations</SectionTitle>
        <Text style={styles.value}>{observations || "—"}</Text>
      </Card>
      <Card>
        <SectionTitle>Remarques</SectionTitle>
        <Text style={styles.value}>{remarks || "—"}</Text>
      </Card>

      <View style={styles.section}>
        <SectionTitle>Photos ({uploadedPhotos.length + pendingPhotos.length})</SectionTitle>
        {uploadedPhotos.length === 0 && pendingPhotos.length === 0 ? (
          <EmptyState title="Aucune photo" />
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {uploadedPhotos.map((p) => p.url && <Image key={p.id} source={{ uri: p.url }} style={styles.thumb} />)}
            {pendingPhotos.map((p) => (
              <View key={p.localId} style={styles.pendingThumbWrap}>
                <Image source={{ uri: p.localUri }} style={[styles.thumb, styles.pendingThumb]} />
                <Text style={styles.pendingLabel}>non envoyée</Text>
              </View>
            ))}
          </ScrollView>
        )}
        {pendingPhotos.length > 0 && <Pill label={`${pendingPhotos.length} en attente d'envoi`} tone="warning" />}
      </View>

      {mutation.isError && (
        <ErrorBanner
          message={
            mutation.error instanceof NetworkError
              ? "Pas de connexion — vos données sont conservées, réessayez."
              : mutation.error instanceof ApiRequestError
                ? mutation.error.message
                : "Échec de la finalisation."
          }
          onRetry={handleComplete}
        />
      )}

      <BigButton label="Confirmer et terminer la visite" onPress={handleComplete} loading={mutation.isPending} />
      <BigButton label="Retour" tone="secondary" onPress={() => router.back()} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.sm },
  scheduled: { fontSize: 13, color: COLORS.textMuted, fontWeight: "600", marginBottom: SPACING.xs },
  value: { fontSize: 14, color: COLORS.text, marginTop: SPACING.xs, lineHeight: 20 },
  section: { marginTop: SPACING.xs, gap: SPACING.xs },
  thumb: { width: 72, height: 72, borderRadius: RADIUS.sm, backgroundColor: COLORS.border, marginRight: SPACING.xs },
  pendingThumbWrap: { alignItems: "center" },
  pendingThumb: { opacity: 0.5 },
  pendingLabel: { fontSize: 10, color: COLORS.warning, fontWeight: "700", marginTop: 2 },
});
