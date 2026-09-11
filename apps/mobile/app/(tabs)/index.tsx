import { StyleSheet } from 'react-native';

import { ConnectionBanner } from '@/components/ConnectionBanner';
import { Text, View } from '@/components/Themed';

/**
 * Today's visits — the first thing a worker sees on opening the app.
 * Will list each assigned visit (customer, property, type, time) with a
 * large tap target that opens app/visit/[id].tsx. Populated once the
 * visits API + auth exist (see /CONTEXT.md "Next steps").
 */
export default function TodayScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Today</Text>
        <Text style={styles.subtitle}>Your visits for today</Text>
      </View>
      <ConnectionBanner />
      <View style={styles.emptyState}>
        <Text style={styles.emptyTitle}>No visits loaded yet</Text>
        <Text style={styles.emptyBody}>
          This screen will list today&apos;s assigned visits once login and the visits API are wired up.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingTop: 12,
    paddingHorizontal: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  subtitle: {
    fontSize: 14,
    opacity: 0.6,
    marginTop: 2,
  },
  emptyState: {
    margin: 16,
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#d0d4db',
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 6,
  },
  emptyBody: {
    fontSize: 13,
    textAlign: 'center',
    opacity: 0.7,
  },
});
