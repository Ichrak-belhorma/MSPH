import { useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';

/**
 * Login screen UI only — not wired to the auth API yet (see
 * /CONTEXT.md "Next steps": JWT access/refresh flow lands with the auth
 * module on the server first, then this screen calls it).
 */
export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <View style={styles.container}>
      <Text style={styles.title}>MSPH</Text>
      <Text style={styles.subtitle}>Worker sign in</Text>

      <TextInput
        style={styles.input}
        placeholder="Email"
        autoCapitalize="none"
        keyboardType="email-address"
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
      />

      <Pressable style={styles.button} onPress={() => router.replace('/(tabs)')}>
        <Text style={styles.buttonText}>Sign in</Text>
      </Pressable>
      <Text style={styles.note}>Login is not implemented yet — this continues straight to the app.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, justifyContent: 'center' },
  title: { fontSize: 32, fontWeight: '700', textAlign: 'center', color: '#0f6e5c' },
  subtitle: { fontSize: 16, textAlign: 'center', opacity: 0.6, marginTop: 4, marginBottom: 32 },
  input: {
    borderWidth: 1,
    borderColor: '#d0d4db',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    marginBottom: 12,
  },
  button: {
    marginTop: 12,
    backgroundColor: '#0f6e5c',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  note: { marginTop: 16, fontSize: 12, textAlign: 'center', opacity: 0.6 },
});
