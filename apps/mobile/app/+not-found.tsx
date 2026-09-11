import { Link, Stack } from "expo-router";
import { StyleSheet, Text } from "react-native";
import { Screen } from "@/components/ui";
import { COLORS, SPACING } from "@/lib/theme";

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: "Introuvable" }} />
      <Screen style={styles.container}>
        <Text style={styles.title}>Cet écran n'existe pas.</Text>
        <Link href="/" style={styles.link}>
          <Text style={styles.linkText}>Retour à l'accueil</Text>
        </Link>
      </Screen>
    </>
  );
}

const styles = StyleSheet.create({
  container: { alignItems: "center", justifyContent: "center", padding: SPACING.xl },
  title: { fontSize: 18, fontWeight: "700", color: COLORS.text },
  link: { marginTop: SPACING.lg, paddingVertical: SPACING.md },
  linkText: { fontSize: 15, color: COLORS.primary, fontWeight: "600" },
});
