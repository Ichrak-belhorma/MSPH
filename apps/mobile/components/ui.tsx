import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  type TextInputProps,
  View,
  type ViewStyle,
} from "react-native";
import { COLORS, RADIUS, SPACING, TOUCH_TARGET } from "../lib/theme";

/**
 * Shared field-app primitives. Built fresh rather than reusing the
 * scaffold's components/Themed.tsx (light/dark `Text`/`View`) — every
 * screen here needs large, high-contrast, purpose-built controls (see
 * lib/theme.ts's doc comment), not generic themed text.
 */

export function Screen({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.screen, style]}>{children}</View>;
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

type ButtonTone = "primary" | "secondary" | "danger" | "neutral";

export function BigButton({
  label,
  onPress,
  tone = "primary",
  disabled,
  loading,
  icon,
}: {
  label: string;
  onPress: () => void;
  tone?: ButtonTone;
  disabled?: boolean;
  loading?: boolean;
  icon?: ReactNode;
}) {
  const toneStyle = buttonTones[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        toneStyle.container,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={toneStyle.text.color as string} />
      ) : (
        <>
          {icon}
          <Text style={[styles.buttonText, toneStyle.text]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const buttonTones: Record<ButtonTone, { container: ViewStyle; text: { color: string } }> = {
  primary: { container: { backgroundColor: COLORS.primary }, text: { color: "#ffffff" } },
  secondary: { container: { backgroundColor: COLORS.surface, borderWidth: 1, borderColor: COLORS.primary }, text: { color: COLORS.primary } },
  danger: { container: { backgroundColor: COLORS.danger }, text: { color: "#ffffff" } },
  neutral: { container: { backgroundColor: "#eceff2" }, text: { color: COLORS.text } },
};

export function TextField({
  label,
  hint,
  style,
  ...inputProps
}: TextInputProps & { label?: string; hint?: string }) {
  return (
    <View style={{ marginBottom: SPACING.md }}>
      {label && <Text style={styles.fieldLabel}>{label}</Text>}
      <TextInput
        placeholderTextColor={COLORS.textMuted}
        style={[styles.input, style]}
        {...inputProps}
      />
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
    </View>
  );
}

type PillTone = "neutral" | "success" | "warning" | "danger" | "info" | "primary";

export function Pill({ label, tone = "neutral" }: { label: string; tone?: PillTone }) {
  return (
    <View style={[styles.pill, pillTones[tone].container]}>
      <Text style={[styles.pillText, pillTones[tone].text]}>{label}</Text>
    </View>
  );
}

const pillTones: Record<PillTone, { container: ViewStyle; text: { color: string } }> = {
  neutral: { container: { backgroundColor: "#eceff2" }, text: { color: COLORS.textMuted } },
  success: { container: { backgroundColor: COLORS.successBg }, text: { color: COLORS.success } },
  warning: { container: { backgroundColor: COLORS.warningBg }, text: { color: COLORS.warning } },
  danger: { container: { backgroundColor: COLORS.dangerBg }, text: { color: COLORS.danger } },
  info: { container: { backgroundColor: COLORS.infoBg }, text: { color: COLORS.info } },
  primary: { container: { backgroundColor: COLORS.primary }, text: { color: "#ffffff" } },
};

export function ScreenLoading({ label = "Chargement…" }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator size="large" color={COLORS.primary} />
      <Text style={styles.mutedText}>{label}</Text>
    </View>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorBannerText}>{message}</Text>
      {onRetry && (
        <Pressable onPress={onRetry} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Réessayer</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <View style={styles.emptyState}>
      <Text style={styles.emptyTitle}>{title}</Text>
      {body && <Text style={styles.emptyBody}>{body}</Text>}
    </View>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionTitle}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADIUS.md,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.lg,
  },
  button: {
    minHeight: TOUCH_TARGET,
    borderRadius: RADIUS.md,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: SPACING.sm,
    paddingHorizontal: SPACING.lg,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.85 },
  buttonText: { fontSize: 17, fontWeight: "700" },
  fieldLabel: { fontSize: 14, fontWeight: "600", color: COLORS.text, marginBottom: SPACING.xs },
  fieldHint: { fontSize: 12, color: COLORS.textMuted, marginTop: SPACING.xs },
  input: {
    minHeight: TOUCH_TARGET,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADIUS.md,
    paddingHorizontal: SPACING.md,
    fontSize: 16,
    backgroundColor: COLORS.surface,
    color: COLORS.text,
  },
  pill: { paddingHorizontal: SPACING.sm, paddingVertical: 4, borderRadius: RADIUS.sm, alignSelf: "flex-start" },
  pillText: { fontSize: 12, fontWeight: "700" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: SPACING.md },
  mutedText: { color: COLORS.textMuted, fontSize: 14 },
  errorBanner: {
    backgroundColor: COLORS.dangerBg,
    borderRadius: RADIUS.md,
    padding: SPACING.md,
    margin: SPACING.lg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: SPACING.sm,
  },
  errorBannerText: { color: COLORS.danger, fontSize: 14, flex: 1 },
  retryButton: { paddingHorizontal: SPACING.md, paddingVertical: SPACING.sm, backgroundColor: COLORS.danger, borderRadius: RADIUS.sm },
  retryButtonText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  emptyState: { padding: SPACING.xl, alignItems: "center", gap: SPACING.xs },
  emptyTitle: { fontSize: 16, fontWeight: "700", color: COLORS.text, textAlign: "center" },
  emptyBody: { fontSize: 13, color: COLORS.textMuted, textAlign: "center" },
  sectionTitle: { fontSize: 13, fontWeight: "700", color: COLORS.textMuted, textTransform: "uppercase", letterSpacing: 0.4, marginBottom: SPACING.sm },
});
