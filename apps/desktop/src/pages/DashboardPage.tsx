import { useMemo } from "react";
import { Link } from "react-router-dom";
import { endOfDay, startOfDay, startOfTomorrow } from "date-fns";
import { CasePriority, CaseStatus } from "@msph/shared";
import { useCasesQuery, type CaseListItem } from "../api/cases.js";
import { useVisitsQuery } from "../api/visits.js";
import { CaseStatusBadge, PriorityBadge, VisitStatusBadge } from "../components/Badge.js";
import { ErrorState, InlineLoading } from "../components/States.js";
import { formatTime, fullName } from "../lib/format.js";
import { VISIT_TYPE_LABELS_FR } from "../lib/labels.js";

const HIGH_PRIORITIES = new Set<CasePriority>([CasePriority.HIGH, CasePriority.URGENT]);

export function DashboardPage() {
  const todayStart = useMemo(() => startOfDay(new Date()), []);
  const todayEnd = useMemo(() => endOfDay(new Date()), []);
  const tomorrowStart = useMemo(() => startOfTomorrow(), []);

  const newCases = useCasesQuery({ status: CaseStatus.NEW, pageSize: 50 });
  const scheduledCases = useCasesQuery({ status: CaseStatus.SCHEDULED, pageSize: 50 });
  const inProgressCases = useCasesQuery({ status: CaseStatus.IN_PROGRESS, pageSize: 50 });
  const resolvedCases = useCasesQuery({ status: CaseStatus.RESOLVED, pageSize: 1 });

  const todaysVisits = useVisitsQuery({ from: todayStart.toISOString(), to: todayEnd.toISOString(), pageSize: 50 });
  const upcomingVisits = useVisitsQuery({ from: tomorrowStart.toISOString(), status: "SCHEDULED", pageSize: 1 });
  const scheduledVisits = useVisitsQuery({ status: "SCHEDULED", pageSize: 100 });

  const isLoading =
    newCases.isLoading || scheduledCases.isLoading || inProgressCases.isLoading || resolvedCases.isLoading;
  const isError = newCases.isError || scheduledCases.isError || inProgressCases.isError || resolvedCases.isError;

  const unresolvedCount = (newCases.data?.total ?? 0) + (scheduledCases.data?.total ?? 0) + (inProgressCases.data?.total ?? 0);

  const activeCases: CaseListItem[] = useMemo(
    () => [...(newCases.data?.items ?? []), ...(scheduledCases.data?.items ?? []), ...(inProgressCases.data?.items ?? [])],
    [newCases.data, scheduledCases.data, inProgressCases.data],
  );

  const needsAttention = useMemo(
    () =>
      activeCases
        .filter((c) => HIGH_PRIORITIES.has(c.priority))
        .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === "URGENT" ? -1 : 1))
        .slice(0, 6),
    [activeCases],
  );

  const caseIdsWithUpcomingVisit = useMemo(
    () => new Set((scheduledVisits.data?.items ?? []).map((v) => v.caseId)),
    [scheduledVisits.data],
  );

  const waitingForFollowUp = useMemo(
    () => (inProgressCases.data?.items ?? []).filter((c) => !caseIdsWithUpcomingVisit.has(c.id)).slice(0, 6),
    [inProgressCases.data, caseIdsWithUpcomingVisit],
  );

  if (isError) {
    return <ErrorState error={newCases.error ?? scheduledCases.error ?? inProgressCases.error} />;
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Tableau de bord</h1>
          <p className="page-header__subtitle">Vue d'ensemble de l'activité en cours.</p>
        </div>
      </div>

      <div className="stat-grid">
        <StatTile label="Nouveaux dossiers" value={newCases.data?.total} loading={isLoading} to="/dossiers?status=NEW" hint="En attente de planification" />
        <StatTile label="Visites aujourd'hui" value={todaysVisits.data?.total} loading={todaysVisits.isLoading} to="/calendrier" hint="Toutes interventions confondues" />
        <StatTile label="Visites à venir" value={upcomingVisits.data?.total} loading={upcomingVisits.isLoading} to="/calendrier" hint="Planifiées après aujourd'hui" />
        <StatTile label="Dossiers non résolus" value={unresolvedCount} loading={isLoading} to="/dossiers" hint="Nouveaux, planifiés ou en cours" />
        <StatTile label="Dossiers résolus" value={resolvedCases.data?.total} loading={isLoading} to="/dossiers?status=RESOLVED" hint="Historique" />
      </div>

      <div className="dashboard-grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className="card">
            <div className="card__header">
              <h2>Dossiers nécessitant de l'attention</h2>
              <span className="muted" style={{ fontSize: 11.5 }}>
                Priorité haute ou urgente
              </span>
            </div>
            <div className="card__body">
              {isLoading ? (
                <InlineLoading />
              ) : needsAttention.length === 0 ? (
                <p className="muted">Aucun dossier prioritaire en attente.</p>
              ) : (
                needsAttention.map((c) => <CaseAttentionRow key={c.id} kase={c} />)
              )}
            </div>
          </div>

          <div className="card">
            <div className="card__header">
              <h2>En attente de suivi</h2>
              <span className="muted" style={{ fontSize: 11.5 }}>
                En cours, sans prochaine visite planifiée
              </span>
            </div>
            <div className="card__body">
              {isLoading || scheduledVisits.isLoading ? (
                <InlineLoading />
              ) : waitingForFollowUp.length === 0 ? (
                <p className="muted">Aucun dossier en attente de suivi.</p>
              ) : (
                waitingForFollowUp.map((c) => <CaseAttentionRow key={c.id} kase={c} />)
              )}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <h2>Activité d'aujourd'hui</h2>
          </div>
          <div className="card__body">
            {todaysVisits.isLoading ? (
              <InlineLoading />
            ) : (todaysVisits.data?.items.length ?? 0) === 0 ? (
              <p className="muted">Aucune visite planifiée aujourd'hui.</p>
            ) : (
              <div className="activity-list">
                {todaysVisits.data!.items
                  .sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt))
                  .map((v) => (
                    <div className="feed-item" key={v.id}>
                      <span className="feed-item__time">{formatTime(v.scheduledAt)}</span>
                      <span className="feed-item__text">
                        {VISIT_TYPE_LABELS_FR[v.type]} —{" "}
                        <Link className="feed-item__case-link" to={`/dossiers/${v.caseId}`}>
                          {fullName(v.case.customer)}
                        </Link>{" "}
                        <span className="muted">({v.case.property.city})</span>
                        {v.assignedWorker && <span className="muted"> · {fullName(v.assignedWorker)}</span>}
                        <div style={{ marginTop: 4 }}>
                          <VisitStatusBadge status={v.status} />
                        </div>
                      </span>
                    </div>
                  ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  loading,
  to,
  hint,
}: {
  label: string;
  value: number | undefined;
  loading: boolean;
  to: string;
  hint: string;
}) {
  return (
    <Link to={to} className="stat-tile stat-tile--link">
      <span className="stat-tile__label">{label}</span>
      <span className="stat-tile__value">{loading ? "—" : (value ?? 0)}</span>
      <span className="stat-tile__hint">{hint}</span>
    </Link>
  );
}

function CaseAttentionRow({ kase }: { kase: CaseListItem }) {
  return (
    <Link
      to={`/dossiers/${kase.id}`}
      className="info-row"
      style={{ textDecoration: "none", color: "inherit", cursor: "pointer" }}
    >
      <span className="info-row__label" style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <span style={{ color: "var(--color-text)", fontWeight: 600 }}>{fullName(kase.customer)}</span>
        <span>{kase.property.city}</span>
      </span>
      <span className="flex-row">
        <PriorityBadge priority={kase.priority} />
        <CaseStatusBadge status={kase.status} />
      </span>
    </Link>
  );
}
