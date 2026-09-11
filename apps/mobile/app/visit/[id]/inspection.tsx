import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useVisitQuery, useRecordInspectionMutation } from "@/api/visits";
import { BigButton, ErrorBanner, ScreenLoading, TextField } from "@/components/ui";
import { ApiRequestError, NetworkError } from "@/lib/apiClient";
import { loadDraft, saveDraft } from "@/lib/draftStore";
import { COLORS, SPACING } from "@/lib/theme";

/**
 * Inspection form — observations / condition / remarks, kept fast per the
 * brief ("keep it fast"): three plain text fields, nothing else. Saves
 * for real via POST /visits/:id/inspection (independent of Complete Visit
 * — a worker can record this mid-visit, and Complete Visit's own review
 * screen shows whatever was last saved here rather than re-asking for it).
 * Every keystroke also persists to the local draft (lib/draftStore) so
 * backgrounding the app or a dropped connection before tapping
 * "Enregistrer" never loses what was typed.
 */
export default function InspectionScreen() {
  const { id: visitId } = useLocalSearchParams<{ id: string }>();
  const visitQuery = useVisitQuery(visitId);
  const mutation = useRecordInspectionMutation(visitQuery.data?.caseId);

  const [observations, setObservations] = useState("");
  const [condition, setCondition] = useState("");
  const [remarks, setRemarks] = useState("");
  const [ready, setReady] = useState(false);
  const [saved, setSaved] = useState(false);
  const loadedOnce = useRef(false);

  useEffect(() => {
    if (loadedOnce.current || !visitQuery.data) return;
    loadedOnce.current = true;
    void loadDraft(visitId).then((draft) => {
      const inspection = visitQuery.data!.inspection;
      setObservations(draft.observations || inspection?.observations || "");
      setCondition(draft.condition || inspection?.condition || "");
      setRemarks(draft.remarks || inspection?.remarks || "");
      setReady(true);
    });
  }, [visitId, visitQuery.data]);

  async function persistDraft(next: { observations: string; condition: string; remarks: string }) {
    const draft = await loadDraft(visitId);
    await saveDraft(visitId, { ...draft, ...next });
  }

  async function handleSave() {
    setSaved(false);
    await persistDraft({ observations, condition, remarks });
    mutation.mutate(
      { id: visitId, input: { observations: observations || undefined, condition: condition || undefined, remarks: remarks || undefined } },
      { onSuccess: () => setSaved(true) },
    );
  }

  if (visitQuery.isLoading || !ready) return <ScreenLoading label="Chargement…" />;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <TextField
          label="État constaté"
          placeholder="Ex. Infestation modérée, traces sous l'évier"
          value={condition}
          onChangeText={(t) => {
            setCondition(t);
            setSaved(false);
          }}
          onBlur={() => void persistDraft({ observations, condition, remarks })}
        />
        <TextField
          label="Observations"
          placeholder="Ce que vous avez constaté sur place"
          value={observations}
          onChangeText={(t) => {
            setObservations(t);
            setSaved(false);
          }}
          onBlur={() => void persistDraft({ observations, condition, remarks })}
          multiline
          numberOfLines={4}
          style={styles.multiline}
        />
        <TextField
          label="Remarques"
          placeholder="Toute autre information utile"
          value={remarks}
          onChangeText={(t) => {
            setRemarks(t);
            setSaved(false);
          }}
          onBlur={() => void persistDraft({ observations, condition, remarks })}
          multiline
          numberOfLines={4}
          style={styles.multiline}
        />

        {mutation.isError && (
          <ErrorBanner
            message={
              mutation.error instanceof NetworkError
                ? "Pas de connexion — vos notes sont conservées, réessayez l'enregistrement."
                : mutation.error instanceof ApiRequestError
                  ? mutation.error.message
                  : "Échec de l'enregistrement."
            }
            onRetry={handleSave}
          />
        )}
        {saved && <Text style={styles.savedNotice}>✓ Enregistré</Text>}

        <BigButton label="Enregistrer" onPress={handleSave} loading={mutation.isPending} />
        <BigButton label="Retour à la visite" tone="secondary" onPress={() => router.back()} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.sm },
  multiline: { minHeight: 100, textAlignVertical: "top", paddingTop: SPACING.sm },
  savedNotice: { color: COLORS.success, fontWeight: "700", textAlign: "center", marginBottom: SPACING.sm },
});
