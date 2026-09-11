import { StyleSheet } from 'react-native';

import { Text, View } from '@/components/Themed';

/** Everything scheduled after today, so a worker can plan their week
 * without opening the desktop calendar. */
export default function UpcomingScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Upcoming</Text>
        <Text style={styles.subtitle}>Visits scheduled after today</Text>
      </View>
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>Nothing to show yet</Text>
        <Text style={styles.emptyBody}>Upcoming assigned visits will appear here.</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 12, paddingHorizontal: 16 },
  title: { fontSize: 28, fontWeight: '700' },
  subtitle: { fontSize: 14, opacity: 0.6, marginTop: 2 },
  emptyState: {
    margin: 16,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d0d4db',
    alignItems: 'center',
  },
  emptyTitle: { fontSize: 16, fontWeight: '600', marginBottom: 6 },
  emptyBody: { fontSize: 13, textAlign: 'center', opacity: 0.7 },
});
