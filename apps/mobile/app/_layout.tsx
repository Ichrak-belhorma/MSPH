import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import { Text, View } from "react-native";
import { QueryClientProvider } from "@tanstack/react-query";
import "react-native-reanimated";

import { AuthProvider, useAuth } from "@/auth/AuthContext";
import { RealtimeProvider } from "@/realtime/RealtimeProvider";
import { queryClient } from "@/lib/queryClient";
import { getConfigError } from "@/lib/config";
import { DevApiBanner } from "@/components/DevApiBanner";
import { ScreenLoading } from "@/components/ui";
import { COLORS, SPACING } from "@/lib/theme";

export { ErrorBoundary } from "expo-router";

SplashScreen.preventAutoHideAsync();

/**
 * A production build with no `EXPO_PUBLIC_API_BASE_URL` baked in at
 * `eas build` time (see lib/config.ts's doc comment) is a build/CI
 * mistake, not a runtime network error — checked once, before anything
 * else mounts (before QueryClientProvider/AuthProvider even exist, since
 * those would just start firing failed requests against nothing). This
 * is the deliberate "fail loudly" counterpart to the old, silent
 * `?? "http://localhost:4000/api"` fallback that used to run
 * unconditionally — see CONTEXT.md session 7.
 */
function ConfigErrorScreen({ message }: { message: string }) {
  return (
    <View style={{ flex: 1, backgroundColor: "#1a1d21", alignItems: "center", justifyContent: "center", padding: SPACING.lg }}>
      <Text style={{ color: "#f5f5f5", fontSize: 16, fontWeight: "700", marginBottom: SPACING.sm }}>
        Erreur de configuration
      </Text>
      <Text style={{ color: "#c9cdd3", fontSize: 13, lineHeight: 19, textAlign: "center" }}>{message}</Text>
    </View>
  );
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync();
  }, [loaded]);

  if (!loaded) return null;

  const configError = getConfigError();
  if (configError) return <ConfigErrorScreen message={configError.message} />;

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <RealtimeProvider>
          <DevApiBanner />
          <RootNavigator />
        </RealtimeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}

/**
 * A worker either sees the login screen or the authenticated app — never
 * both, and never a flash of one before the other (see AuthContext's
 * `initializing`, resuming a session from secure storage before anything
 * renders). `Stack.Protected`'s `guard` swaps the whole screen set based
 * on `isAuthenticated`, which is also what instantly kicks a worker back
 * to login the moment a session dies (refresh token revoked/expired —
 * see lib/apiClient.ts's SessionExpiredError path).
 */
function RootNavigator() {
  const { isAuthenticated, initializing } = useAuth();

  if (initializing) {
    return (
      <View style={{ flex: 1, backgroundColor: COLORS.background }}>
        <ScreenLoading label="Connexion en cours…" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: COLORS.background } }}>
      <Stack.Protected guard={isAuthenticated}>
        <Stack.Screen name="index" />
        <Stack.Screen name="visit/[id]/index" options={{ headerShown: true, title: "" }} />
        <Stack.Screen
          name="visit/[id]/photos"
          options={{ headerShown: true, title: "Photos", presentation: "modal" }}
        />
        <Stack.Screen
          name="visit/[id]/inspection"
          options={{ headerShown: true, title: "Inspection", presentation: "modal" }}
        />
        <Stack.Screen
          name="visit/[id]/treatment/[caseTreatmentId]"
          options={{ headerShown: true, title: "Traitement", presentation: "modal" }}
        />
        <Stack.Screen
          name="visit/[id]/complete"
          options={{ headerShown: true, title: "Terminer la visite", presentation: "modal" }}
        />
      </Stack.Protected>
      <Stack.Protected guard={!isAuthenticated}>
        <Stack.Screen name="login" />
      </Stack.Protected>
    </Stack>
  );
}
