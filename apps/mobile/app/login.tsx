import { useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from "react-native";
import { ApiRequestError, NetworkError } from "@/lib/apiClient";
import { useAuth } from "@/auth/AuthContext";
import { BigButton, Screen, TextField } from "@/components/ui";
import { COLORS, SPACING } from "@/lib/theme";

export default function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!email.trim() || !password) {
      setError("Entrez votre email et votre mot de passe.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
    } catch (err) {
      if (err instanceof NetworkError) {
        setError("Impossible de contacter le serveur. Vérifiez votre connexion.");
      } else if (err instanceof ApiRequestError) {
        setError(err.status === 401 ? "Email ou mot de passe incorrect." : err.message);
      } else {
        setError("Une erreur est survenue.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>MSPH</Text>
          <Text style={styles.subtitle}>Application intervenants</Text>

          <TextField
            label="Email"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
            placeholder="prenom.nom@msph.local"
            editable={!submitting}
          />
          <TextField
            label="Mot de passe"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            placeholder="••••••••"
            editable={!submitting}
          />

          {error && <Text style={styles.error}>{error}</Text>}

          <BigButton label="Se connecter" onPress={handleSubmit} loading={submitting} />
        </ScrollView>
      </Screen>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, justifyContent: "center", padding: SPACING.xl },
  title: { fontSize: 36, fontWeight: "800", textAlign: "center", color: COLORS.primary },
  subtitle: { fontSize: 16, textAlign: "center", color: COLORS.textMuted, marginTop: SPACING.xs, marginBottom: SPACING.xxl },
  error: { color: COLORS.danger, fontSize: 14, textAlign: "center", marginBottom: SPACING.md },
});
