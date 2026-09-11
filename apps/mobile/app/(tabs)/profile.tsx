import { Pressable, StyleSheet } from 'react-native';
import { router } from 'expo-router';

import { Text, View } from '@/components/Themed';

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Profile</Text>
      </View>
      <Text style={styles.body}>
        Worker account details and sign-out will live here once authentication is implemented.
      </Text>
      <Pressable style={styles.button} onPress={() => router.push('/login')}>
        <Text style={styles.buttonText}>Go to login screen (preview)</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: { paddingTop: 12 },
  title: { fontSize: 28, fontWeight: '700' },
  body: { fontSize: 14, opacity: 0.7, marginTop: 16, lineHeight: 20 },
  button: {
    marginTop: 24,
    backgroundColor: '#0f6e5c',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
