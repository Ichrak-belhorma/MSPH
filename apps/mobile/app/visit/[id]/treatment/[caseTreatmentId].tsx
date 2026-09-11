import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useVisitQuery } from "@/api/visits";
import { useCaseQuery, useUpdateCaseTreatmentMutation } from "@/api/cases";
import { BigButton, Card, ErrorBanner, Pill, ScreenLoading, SectionTitle, TextField } from "@/components/ui";
import { ApiRequestError, NetworkError } from "@/lib/apiClient";
import { loadDraft, saveDraft } from "@/lib/draftStore";
import { CASE_TREATMENT_STATUS_LABELS_FR } from "@/lib/labels";
import { COLORS, SPACING } from "@/lib/theme";

const TONE = { PLANNED: "info", COMPLETED: "success", CANCELLED: "neutral" } as const;

/**
 * Treatment — shows the catalog procedure's instructions and safety
 * information (the brief's explicit ask) for one treatment assigned to
 * this case, and lets the worker record it as performed with notes.
 * Adding/removing which treatments a case gets stays admin-only (desktop
 * app, see CONTEXT.md "Authorization model") — this screen only ever
 * PATCHes the one case-treatment it was opened for.
 */
export default function TreatmentScreen() {
  const { id: visitId, caseTreatmentId } = useLocalSearchParams<{ id: string; caseTreatmentId: string }>();
  const visitQuery = useVisitQuery(visitId);
  const caseQuery = useCaseQuery(visitQuery.data?.caseId);
  const mutation = useUpdateCaseTreatmentMutation(visitQuery.data?.caseId ?? "");

  const [notes, setNotes] = useState("");
  const [ready, setReady] = useState(false);
  const loadedOnce = useRef(false);

  const caseTreatment = caseQuery.data?.treatments.find((ct) => ct.id === caseTreatmentId);

  useEffect(() => {
    if (loadedOnce.current || !caseTreatment) return;
    loadedOnce.current = true;
    void loadDraft(visitId).then((draft) => {
      setNotes(draft.treatmentNotes[caseTreatmentId] ?? caseTreatment.notes ?? "");
      setReady(true);
    });
  }, [visitId, caseTreatmentId, caseTreatment]);

  async function persistDraftNotes(text: string) {
    const draft = await loadDraft(visitId);
    await saveDraft(visitId, { ...draft, treatmentNotes: { ...draft.treatmentNotes, [caseTreatmentId]: text } });
  }

  function handleSaveNotes() {
    mutation.mutate({ caseTreatmentId, input: { notes } });
  }

  function handleMarkPerformed() {
    mutation.mutate({ caseTreatmentId, input: { status: "COMPLETED", notes } });
  }

  if (visitQuery.isLoading || caseQuery.isLoading || !ready) return <ScreenLoading label="Chargement…" />;
  if (!caseTreatment) return <ErrorBanner message="Traitement introuvable pour ce dossier." />;

  const t = caseTreatment.treatment;
  const isPerformed = caseTreatment.status === "COMPLETED";

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Text style={styles.name}>{t.name}</Text>
          <Pill label={CASE_TREATMENT_STATUS_LABELS_FR[caseTreatment.status]} tone={TONE[caseTreatment.status]} />
        </View>

        {t.description && (
          <Card>
            <SectionTitle>Description</SectionTitle>
            <Text style={styles.value}>{t.description}</Text>
          </Card>
        )}

        {t.instructions && (
          <Card>
            <SectionTitle>Instructions</SectionTitle>
            <Text style={styles.value}>{t.instructions}</Text>
          </Card>
        )}

        {t.safetyInformation && (
          <Card style={styles.safetyCard}>
            <SectionTitle>⚠️ Sécurité</SectionTitle>
            <Text style={styles.safetyValue}>{t.safetyInformation}</Text>
          </Card>
        )}

        {t.durationMinutes && (
          <Text style={styles.duration}>Durée estimée : {t.durationMinutes} min</Text>
        )}

        <TextField
          label="Notes"
          placeholder="Produit utilisé, quantité, particularités…"
          value={notes}
          onChangeText={(text) => {
            setNotes(text);
            void persistDraftNotes(text);
          }}
          multiline
          numberOfLines={4}
          style={styles.multiline}
        />

        {mutation.isError && (
          <ErrorBanner
            message={
              mutation.error instanceof NetworkError
                ? "Pas de connexion — vos notes sont conservées, réessayez."
                : mutation.error instanceof ApiRequestError
                  ? mutation.error.message
                  : "Échec de l'enregistrement."
            }
          />
        )}
        {mutation.isSuccess && <Text style={styles.savedNotice}>✓ Enregistré</Text>}

        {!isPerformed && (
          <BigButton label="Marquer comme effectué" onPress={handleMarkPerformed} loading={mutation.isPending} />
        )}
        <BigButton label="Enregistrer les notes" tone="secondary" onPress={handleSaveNotes} loading={mutation.isPending} />
        <BigButton label="Retour à la visite" tone="neutral" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.sm },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: SPACING.xs },
  name: { fontSize: 20, fontWeight: "800", color: COLORS.text, flexShrink: 1, marginRight: SPACING.sm },
  value: { fontSize: 14, color: COLORS.text, marginTop: SPACING.xs, lineHeight: 20 },
  safetyCard: { backgroundColor: COLORS.warningBg, borderColor: COLORS.warning },
  safetyValue: { fontSize: 14, color: "#5c4008", marginTop: SPACING.xs, lineHeight: 20, fontWeight: "600" },
  duration: { fontSize: 13, color: COLORS.textMuted, fontWeight: "600" },
  multiline: { minHeight: 100, textAlignVertical: "top", paddingTop: SPACING.sm },
  savedNotice: { color: COLORS.success, fontWeight: "700", textAlign: "center" },
});
