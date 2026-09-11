import { Pressable, StyleSheet, Text, View } from "react-native";
import type { VisitDetail } from "@/api/visits";
import { fullName, formatTime } from "@/lib/format";
import { VISIT_STATUS_LABELS_FR, VISIT_TYPE_LABELS_FR } from "@/lib/labels";
import { COLORS, RADIUS, SPACING } from "@/lib/theme";
import { Pill } from "./ui";

const STATUS_TONE = {
  SCHEDULED: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "success",
  CANCELLED: "neutral",
  NO_SHOW: "danger",
} as const;

/** One row in the Today/overdue lists — every field a worker needs to
 * decide "is this the visit I should go to next" at a glance, nothing
 * more (no problem description, no landlord — that's Visit Detail's job). */
export function VisitListItem({ visit, onPress, overdue }: { visit: VisitDetail; onPress: () => void; overdue?: boolean }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}>
      <View style={styles.time}>
        <Text style={styles.timeText}>{formatTime(visit.scheduledAt)}</Text>
        {overdue && <Pill label="En retard" tone="danger" />}
      </View>
      <View style={styles.body}>
        <Text style={styles.customer} numberOfLines={1}>
          {fullName(visit.case.customer)}
        </Text>
        <Text style={styles.address} numberOfLines={1}>
          {visit.case.property.address}, {visit.case.property.city}
        </Text>
        <Text style={styles.type}>{VISIT_TYPE_LABELS_FR[visit.type]}</Text>
      </View>
      <Pill label={VISIT_STATUS_LABELS_FR[visit.status]} tone={STATUS_TONE[visit.status]} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.md,
    gap: SPACING.md,
    marginBottom: SPACING.sm,
  },
  rowPressed: { opacity: 0.7 },
  time: { width: 64, alignItems: "flex-start", gap: SPACING.xs },
  timeText: { fontSize: 16, fontWeight: "800", color: COLORS.text },
  body: { flex: 1, gap: 2 },
  customer: { fontSize: 15, fontWeight: "700", color: COLORS.text },
  address: { fontSize: 13, color: COLORS.textMuted },
  type: { fontSize: 12, color: COLORS.primary, fontWeight: "600" },
});
