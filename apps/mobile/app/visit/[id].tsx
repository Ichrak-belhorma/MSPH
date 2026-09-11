import { useLocalSearchParams } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

/**
 * Visit detail — the core mobile screen. Will show customer/property info,
 * problem description, previous visits, treatments, and the actions a
 * worker needs on site: start visit, take photos, add remarks/
 * observations, complete visit. Structure sketched here now so the routes
 * exist; wiring to real data comes with the visits API (see
 * /CONTEXT.md "Next steps").
 */
export default function VisitDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Visit {id}</Text>
      <Text style={styles.muted}>Customer, property and problem details will appear here.</Text>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Actions</Text>
        <Pressable style={styles.actionButton}>
          <Text style={styles.actionText}>Start visit</Text>
        </Pressable>
        <Pressable style={styles.actionButton}>
          <Text style={styles.actionText}>Take photo</Text>
        </Pressable>
        <Pressable style={styles.actionButton}>
          <Text style={styles.actionText}>Add remark</Text>
        </Pressable>
        <Pressable style={[styles.actionButton, styles.completeButton]}>
          <Text style={[styles.actionText, styles.completeText]}>Complete visit</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  title: { fontSize: 22, fontWeight: '700' },
  muted: { fontSize: 14, opacity: 0.6, marginTop: 4 },
  section: { marginTop: 24 },
  sectionTitle: { fontSize: 15, fontWeight: '600', marginBottom: 10, opacity: 0.8 },
  actionButton: {
    backgroundColor: '#eef1f4',
    paddingVertical: 18,
    borderRadius: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  completeButton: { backgroundColor: '#0f6e5c' },
  actionText: { fontSize: 16, fontWeight: '600' },
  completeText: { color: '#fff' },
});
