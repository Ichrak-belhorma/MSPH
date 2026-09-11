import { Text, View } from "react-native";
import { getApiBaseUrl, isUsingDevDefaultApi } from "@/lib/config";
import { COLORS, SPACING } from "@/lib/theme";

/**
 * Shown only when no `EXPO_PUBLIC_API_BASE_URL` was configured and the
 * app fell back to the hardcoded local dev default (`lib/config.ts`).
 * Makes it obvious — on the actual device, not just in a doc comment —
 * that this build is pointed at a developer's machine, not a real API,
 * so nobody mistakes a stray dev build for a working production app (or
 * vice versa, wonders why a real device can't reach "localhost").
 * Renders nothing in every other case (including a normal production
 * build, which always has a real URL — see config.ts).
 */
export function DevApiBanner() {
  if (!isUsingDevDefaultApi()) return null;

  return (
    <View
      style={{
        backgroundColor: COLORS.warningBg,
        borderBottomWidth: 1,
        borderBottomColor: COLORS.warning,
        paddingVertical: SPACING.xs,
        paddingHorizontal: SPACING.md,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: "700", color: COLORS.warning, textAlign: "center" }}>
        MODE DÉV — API locale ({getApiBaseUrl()})
      </Text>
    </View>
  );
}
