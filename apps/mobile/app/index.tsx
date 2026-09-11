import { useMemo, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { router } from "expo-router";
import { useAuth } from "@/auth/AuthContext";
import { useMyVisitsQuery, type VisitDetail } from "@/api/visits";
import { VisitListItem } from "@/components/VisitListItem";
import { EmptyState, ErrorBanner, ScreenLoading, SectionTitle } from "@/components/ui";
import { ApiRequestError, NetworkError } from "@/lib/apiClient";
import { formatDayMonth } from "@/lib/format";
import { COLORS, SPACING } from "@/lib/theme";

function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}
function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

const ACTIVE_STATUSES = new Set(["SCHEDULED", "IN_PROGRESS"]);

/**
 * Home / Today — the first (and usually only) screen a worker needs.
 * "Show today's visits, next visit, overdue/incomplete visits, simple
 * status" (brief) — nothing administrative, no navigation depth beyond
 * tapping into a visit. Three real, server-backed queries, no fabricated
 * counts: today's date range (all statuses, so a completed visit still
 * shows as done rather than disappearing), and two overdue queries
 * (still-SCHEDULED and still-IN_PROGRESS visits from before today) merged
 * client-side — the same pattern as the desktop dashboard's derived
 * sections (see CONTEXT.md 17.6), just worker-scoped instead of
 * company-wide (the server itself forces that scoping, see api/visits.ts).
 */
export default function HomeScreen() {
  const { user, logout } = useAuth();
  const [refreshing, setRefreshing] = useState(false);

  const todayFrom = useMemo(() => startOfToday().toISOString(), []);
  const todayTo = useMemo(() => endOfToday().toISOString(), []);

  const todayQuery = useMyVisitsQuery({ from: todayFrom, to: todayTo, pageSize: 100 });
  const overdueScheduledQuery = useMyVisitsQuery({ status: "SCHEDULED", to: todayFrom, pageSize: 100 });
  const overdueInProgressQuery = useMyVisitsQuery({ status: "IN_PROGRESS", to: todayFrom, pageSize: 100 });

  const isLoading = todayQuery.isLoading || overdueScheduledQuery.isLoading || overdueInProgressQuery.isLoading;
  const firstError = todayQuery.error ?? overdueScheduledQuery.error ?? overdueInProgressQuery.error;

  const todayItems = todayQuery.data?.items ?? [];
  const overdueItems = useMemo(() => {
    const merged = [...(overdueScheduledQuery.data?.items ?? []), ...(overdueInProgressQuery.data?.items ?? [])];
    return merged.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
  }, [overdueScheduledQuery.data, overdueInProgressQuery.data]);

  const nextVisit: VisitDetail | undefined = useMemo(() => {
    const upcoming = [...overdueItems, ...todayItems.filter((v) => ACTIVE_STATUSES.has(v.status))];
    upcoming.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return upcoming[0];
  }, [overdueItems, todayItems]);

  async function onRefresh() {
    setRefreshing(true);
    await Promise.all([todayQuery.refetch(), overdueScheduledQuery.refetch(), overdueInProgressQuery.refetch()]).catch(() => undefined);
    setRefreshing(false);
  }

  function confirmLogout() {
    Alert.alert("Déconnexion", "Voulez-vous vous déconnecter ?", [
      { text: "Annuler", style: "cancel" },
      { text: "Se déconnecter", style: "destructive", onPress: () => void logout() },
    ]);
  }

  if (isLoading) return <ScreenLoading label="Chargement de vos visites…" />;

  const errorMessage =
    firstError instanceof NetworkError
      ? "Pas de connexion — tirez vers le bas pour réessayer."
      : firstError instanceof ApiRequestError
        ? firstError.message
        : null;

  // The "Prochaine visite" card above already shows the single most
  // urgent visit — don't repeat that same card a second time in the
  // "Aujourd'hui" list below it (the count in the section title still
  // reflects every visit scheduled today, dedup is display-only).
  const todayListItems = nextVisit ? todayItems.filter((v) => v.id !== nextVisit.id) : todayItems;

  return (
    <FlatList
      style={styles.screen}
      contentContainerStyle={styles.content}
      data={todayListItems}
      keyExtractor={(v) => v.id}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={COLORS.primary} />}
      ListHeaderComponent={
        <View>
          <View style={styles.header}>
            <View>
              <Text style={styles.greeting}>Bonjour, {user?.firstName}</Text>
              <Text style={styles.date}>{formatDayMonth(new Date().toISOString())}</Text>
            </View>
            <Text onPress={confirmLogout} style={styles.logout}>
              Déconnexion
            </Text>
          </View>

          {errorMessage && <ErrorBanner message={errorMessage} onRetry={onRefresh} />}

          {nextVisit && (
            <View style={styles.nextSection}>
              <SectionTitle>Prochaine visite</SectionTitle>
              <VisitListItem
                visit={nextVisit}
                overdue={overdueItems.some((v) => v.id === nextVisit.id)}
                onPress={() => router.push(`/visit/${nextVisit.id}`)}
              />
            </View>
          )}

          {overdueItems.length > 0 && (
            <View style={styles.section}>
              <SectionTitle>En retard / non terminées ({overdueItems.length})</SectionTitle>
              {overdueItems.map((v) => (
                <VisitListItem key={v.id} visit={v} overdue onPress={() => router.push(`/visit/${v.id}`)} />
              ))}
            </View>
          )}

          <View style={styles.section}>
            <SectionTitle>Aujourd'hui ({todayItems.length})</SectionTitle>
          </View>
        </View>
      }
      renderItem={({ item }) => <VisitListItem visit={item} onPress={() => router.push(`/visit/${item.id}`)} />}
      contentInsetAdjustmentBehavior="automatic"
      ListEmptyComponent={
        !errorMessage ? <EmptyState title="Aucune visite aujourd'hui" body="Vos visites planifiées pour aujourd'hui apparaîtront ici." /> : null
      }
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: COLORS.background },
  content: { padding: SPACING.lg, paddingBottom: SPACING.xxl },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: SPACING.lg },
  greeting: { fontSize: 24, fontWeight: "800", color: COLORS.text },
  date: { fontSize: 14, color: COLORS.textMuted, marginTop: 2, textTransform: "capitalize" },
  logout: { fontSize: 13, color: COLORS.danger, fontWeight: "600", paddingVertical: SPACING.sm },
  nextSection: { marginBottom: SPACING.lg },
  section: { marginBottom: SPACING.sm },
});
