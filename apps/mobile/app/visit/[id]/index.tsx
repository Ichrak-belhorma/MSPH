import { useState } from "react";
import { Image, Linking, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, Stack, useLocalSearchParams } from "expo-router";
import type { CaseTreatment, Treatment } from "@msph/shared";
import { useVisitQuery, useStartVisitMutation } from "@/api/visits";
import { useCaseQuery } from "@/api/cases";
import { BigButton, Card, EmptyState, ErrorBanner, Pill, ScreenLoading, SectionTitle } from "@/components/ui";
import { PhotoLightbox } from "@/components/PhotoLightbox";
import { ApiRequestError, NetworkError } from "@/lib/apiClient";
import { formatDateTime, fullName } from "@/lib/format";
import { CASE_TREATMENT_STATUS_LABELS_FR, VISIT_STATUS_LABELS_FR, VISIT_TYPE_LABELS_FR } from "@/lib/labels";
import { COLORS, RADIUS, SPACING } from "@/lib/theme";

const STATUS_TONE = {
  SCHEDULED: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "neutral",
  NO_SHOW: "danger",
} as const;

const TREATMENT_TONE = { PLANNED: "info", COMPLETED: "success", CANCELLED: "neutral" } as const;

interface PhotoLike {
  id: string;
  url: string | null;
  caption: string | null;
}

export default function VisitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const visitQuery = useVisitQuery(id);
  const caseQuery = useCaseQuery(visitQuery.data?.caseId);
  const startMutation = useStartVisitMutation(visitQuery.data?.caseId);
  const [lightboxUri, setLightboxUri] = useState<string | null>(null);

  if (visitQuery.isLoading) return <ScreenLoading label="Chargement de la visite…" />;

  if (visitQuery.isError || !visitQuery.data) {
    const err = visitQuery.error;
    const message = err instanceof NetworkError ? "Pas de connexion." : err instanceof ApiRequestError ? err.message : "Visite introuvable.";
    return <ErrorBanner message={message} onRetry={() => void visitQuery.refetch()} />;
  }

  const visit = visitQuery.data;
  const kase = caseQuery.data;
  const phone = visit.case.customer.phone;

  const photosForThisVisit = kase?.photos.filter((p) => p.visitId === visit.id) ?? [];
  const previousVisits = (kase?.visits ?? [])
    .filter((v) => v.id !== visit.id)
    .sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));

  const hasStarted = visit.status !== "SCHEDULED";
  const isDone = visit.status === "COMPLETED";
  const isClosed = visit.status === "CANCELLED" || visit.status === "NO_SHOW";

  return (
    <>
      <Stack.Screen options={{ title: VISIT_TYPE_LABELS_FR[visit.type] }} />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
        <View style={styles.statusRow}>
          <Pill label={VISIT_STATUS_LABELS_FR[visit.status]} tone={STATUS_TONE[visit.status]} />
          <Text style={styles.scheduled}>{formatDateTime(visit.scheduledAt)}</Text>
        </View>

        <Card>
          <SectionTitle>Client</SectionTitle>
          <Text style={styles.name}>{fullName(visit.case.customer)}</Text>
          {phone && (
            <Text style={styles.phone} onPress={() => Linking.openURL(`tel:${phone}`)}>
              📞 {phone}
            </Text>
          )}
        </Card>

        <Card>
          <SectionTitle>Propriété</SectionTitle>
          <Text style={styles.value}>{visit.case.property.address}</Text>
          <Text style={styles.valueMuted}>{visit.case.property.city}</Text>
        </Card>

        <Card>
          <SectionTitle>Problème signalé</SectionTitle>
          <Text style={styles.value}>{visit.case.problemDescription}</Text>
        </Card>

        {isClosed && (
          <Card>
            <Text style={styles.closedNotice}>
              Cette visite est {VISIT_STATUS_LABELS_FR[visit.status].toLowerCase()} — aucune action requise.
            </Text>
          </Card>
        )}

        {!hasStarted && !isClosed && (
          <BigButton label="Démarrer la visite" onPress={() => startMutation.mutate({ id: visit.id })} loading={startMutation.isPending} />
        )}
        {startMutation.isError && (
          <ErrorBanner
            message={
              startMutation.error instanceof NetworkError
                ? "Pas de connexion — réessayez."
                : startMutation.error instanceof ApiRequestError
                  ? startMutation.error.message
                  : "Impossible de démarrer la visite."
            }
          />
        )}

        {hasStarted && !isClosed && (
          <View style={styles.actionsGrid}>
            <View style={{ flex: 1 }}>
              <BigButton
                label={`Photos${photosForThisVisit.length ? ` (${photosForThisVisit.length})` : ""}`}
                tone="secondary"
                onPress={() => router.push(`/visit/${visit.id}/photos`)}
              />
            </View>
            <View style={{ flex: 1 }}>
              <BigButton
                label={visit.inspection?.observations || visit.inspection?.condition ? "Observations ✓" : "Observations"}
                tone="secondary"
                onPress={() => router.push(`/visit/${visit.id}/inspection`)}
              />
            </View>
          </View>
        )}

        {kase && kase.treatments.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Traitements du dossier</SectionTitle>
            {kase.treatments.map((ct) => (
              <TreatmentRow key={ct.id} caseTreatment={ct} visitId={visit.id} disabled={!hasStarted || isClosed} />
            ))}
          </View>
        )}

        {hasStarted && !isDone && !isClosed && (
          <BigButton label="Terminer la visite" tone="primary" onPress={() => router.push(`/visit/${visit.id}/complete`)} />
        )}

        {isDone && (visit.inspection?.observations || visit.inspection?.remarks || visit.inspection?.condition) && (
          <Card>
            <SectionTitle>Inspection enregistrée</SectionTitle>
            {visit.inspection?.condition && <Field label="État constaté" value={visit.inspection.condition} />}
            {visit.inspection?.observations && <Field label="Observations" value={visit.inspection.observations} />}
            {visit.inspection?.remarks && <Field label="Remarques" value={visit.inspection.remarks} />}
          </Card>
        )}

        {photosForThisVisit.length > 0 && (
          <View style={styles.section}>
            <SectionTitle>Photos de cette visite</SectionTitle>
            <PhotoThumbRow photos={photosForThisVisit} onOpen={setLightboxUri} />
          </View>
        )}

        <View style={styles.section}>
          <SectionTitle>Visites précédentes de ce dossier</SectionTitle>
          {previousVisits.length === 0 ? (
            <EmptyState title="Aucune visite précédente" />
          ) : (
            previousVisits.slice(0, 5).map((v) => {
              const visitPhotos = kase?.photos.filter((p) => p.visitId === v.id) ?? [];
              return (
                <Card key={v.id} style={styles.previousCard}>
                  <View style={styles.previousHeader}>
                    <Text style={styles.previousDate}>{formatDateTime(v.scheduledAt)}</Text>
                    <Pill label={VISIT_STATUS_LABELS_FR[v.status]} tone={STATUS_TONE[v.status]} />
                  </View>
                  <Text style={styles.previousType}>{VISIT_TYPE_LABELS_FR[v.type]}</Text>
                  {v.inspection?.condition && <Text style={styles.previousSummary}>{v.inspection.condition}</Text>}
                  {visitPhotos.length > 0 && <PhotoThumbRow photos={visitPhotos} onOpen={setLightboxUri} small />}
                </Card>
              );
            })
          )}
        </View>
      </ScrollView>
      <PhotoLightbox uri={lightboxUri} onClose={() => setLightboxUri(null)} />
    </>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ marginBottom: SPACING.sm }}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

/** A case-treatment row is itself the touch target (the whole card is
 * pressable, styled like Card but built directly as a Pressable since
 * Card doesn't forward onPress). */
function TreatmentRow({
  caseTreatment,
  visitId,
  disabled,
}: {
  caseTreatment: CaseTreatment & { treatment: Treatment };
  visitId: string;
  disabled: boolean;
}) {
  return (
    <Pressable
      disabled={disabled}
      onPress={() => router.push(`/visit/${visitId}/treatment/${caseTreatment.id}`)}
      style={({ pressed }) => [styles.treatmentRow, pressed && !disabled && { opacity: 0.7 }, disabled && { opacity: 0.5 }]}
    >
      <View style={{ flex: 1 }}>
        <Text style={styles.treatmentName}>{caseTreatment.treatment.name}</Text>
        {caseTreatment.notes && (
          <Text style={styles.previousSummary} numberOfLines={1}>
            {caseTreatment.notes}
          </Text>
        )}
      </View>
      <Pill label={CASE_TREATMENT_STATUS_LABELS_FR[caseTreatment.status]} tone={TREATMENT_TONE[caseTreatment.status]} />
    </Pressable>
  );
}

function PhotoThumbRow({ photos, onOpen, small }: { photos: PhotoLike[]; onOpen: (uri: string) => void; small?: boolean }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: SPACING.xs }}>
      {photos.map(
        (p) =>
          p.url && (
            <Pressable key={p.id} onPress={() => onOpen(p.url!)} style={{ marginRight: SPACING.xs }}>
              <Image source={{ uri: p.url }} style={small ? styles.thumbSmall : styles.thumb} />
            </Pressable>
          ),
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.md },
  statusRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  scheduled: { fontSize: 14, color: COLORS.textMuted, fontWeight: "600" },
  name: { fontSize: 20, fontWeight: "800", color: COLORS.text, marginTop: SPACING.xs },
  phone: { fontSize: 16, color: COLORS.primary, fontWeight: "700", marginTop: SPACING.xs },
  value: { fontSize: 15, color: COLORS.text, marginTop: SPACING.xs, lineHeight: 21 },
  valueMuted: { fontSize: 14, color: COLORS.textMuted, marginTop: 2 },
  fieldLabel: { fontSize: 12, fontWeight: "700", color: COLORS.textMuted, marginBottom: 2 },
  closedNotice: { color: COLORS.textMuted, fontSize: 14, textAlign: "center" },
  actionsGrid: { flexDirection: "row", gap: SPACING.sm },
  section: { marginTop: SPACING.sm },
  previousCard: { marginBottom: SPACING.sm },
  previousHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  previousDate: { fontSize: 13, fontWeight: "700", color: COLORS.text },
  previousType: { fontSize: 12, color: COLORS.primary, fontWeight: "600", marginTop: 2 },
  previousSummary: { fontSize: 13, color: COLORS.textMuted, marginTop: SPACING.xs },
  treatmentRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    marginBottom: SPACING.sm,
  },
  treatmentName: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  thumb: { width: 72, height: 72, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
  thumbSmall: { width: 48, height: 48, borderRadius: RADIUS.sm, backgroundColor: COLORS.border },
});
