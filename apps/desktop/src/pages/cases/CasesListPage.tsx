import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { CaseStatus, type CasePriority } from "@msph/shared";
import { useCasesQuery, type CaseListItem } from "../../api/cases.js";
import { useVisitsQuery, type VisitDetail } from "../../api/visits.js";
import { CaseStatusBadge, PriorityBadge } from "../../components/Badge.js";
import { EmptyState, ErrorState, LoadingState } from "../../components/States.js";
import { formatRelativeDay, formatTimeAgo, fullName } from "../../lib/format.js";
import { IconPlus, IconSearch } from "../../components/icons.js";

type SortKey = "customer" | "priority" | "status" | "updatedAt";

const STATUS_FILTERS: { value: CaseStatus | ""; label: string }[] = [
  { value: "", label: "Tous" },
  { value: CaseStatus.NEW, label: "Nouveau" },
  { value: CaseStatus.SCHEDULED, label: "Planifié" },
  { value: CaseStatus.IN_PROGRESS, label: "En cours" },
  { value: CaseStatus.RESOLVED, label: "Résolu" },
  { value: CaseStatus.CANCELLED, label: "Annulé" },
];

const PRIORITY_ORDER: Record<CasePriority, number> = { URGENT: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

export function CasesListPage() {
  const navigate = useNavigate();
  const openCase = (id: string) => navigate(`/dossiers/${id}`);
  const [searchParams, setSearchParams] = useSearchParams();
  const status = (searchParams.get("status") as CaseStatus | null) ?? "";
  const [search, setSearch] = useState(searchParams.get("q") ?? "");
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [priority, setPriority] = useState<CasePriority | "">("");
  const [sortKey, setSortKey] = useState<SortKey>("updatedAt");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [page, setPage] = useState(1);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => setPage(1), [status, debouncedSearch, priority]);

  const casesQuery = useCasesQuery({
    status: status || undefined,
    search: debouncedSearch || undefined,
    page,
    pageSize: 25,
  });

  // Cross-referenced against real scheduled visits — see CONTEXT.md for
  // why "next consultation" / "assigned worker" aren't part of the case
  // list endpoint itself (they're visit-level facts, not case fields).
  // 100 is the API's hard pageSize cap (see paginationQuerySchema) — fine
  // at this company's scale, but the first place to revisit if the
  // number of simultaneously-scheduled visits ever grows past it.
  const upcomingVisits = useVisitsQuery({ status: "SCHEDULED", pageSize: 100 });

  const nextVisitByCase = useMemo(() => {
    const map = new Map<string, VisitDetail>();
    for (const visit of upcomingVisits.data?.items ?? []) {
      const existing = map.get(visit.caseId);
      if (!existing || visit.scheduledAt < existing.scheduledAt) map.set(visit.caseId, visit);
    }
    return map;
  }, [upcomingVisits.data]);

  const rows = useMemo(() => {
    let items = casesQuery.data?.items ?? [];
    if (priority) items = items.filter((c) => c.priority === priority);
    items = [...items].sort((a, b) => {
      let cmp = 0;
      if (sortKey === "customer") cmp = fullName(a.customer).localeCompare(fullName(b.customer));
      else if (sortKey === "priority") cmp = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      else if (sortKey === "status") cmp = a.status.localeCompare(b.status);
      else cmp = a.updatedAt.localeCompare(b.updatedAt);
      return sortDir === "asc" ? cmp : -cmp;
    });
    return items;
  }, [casesQuery.data, priority, sortKey, sortDir]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "updatedAt" ? "desc" : "asc");
    }
  }

  function setStatusFilter(value: string) {
    const next = new URLSearchParams(searchParams);
    if (value) next.set("status", value);
    else next.delete("status");
    setSearchParams(next, { replace: true });
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Dossiers</h1>
          <p className="page-header__subtitle">{casesQuery.data ? `${casesQuery.data.total} dossier(s)` : " "}</p>
        </div>
        <div className="page-header__actions">
          <Link to="/dossiers/nouveau" className="btn btn--primary">
            <IconPlus /> Nouveau dossier
          </Link>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="table-toolbar__filters">
          <div className="search-input-wrap">
            <IconSearch className="icon" />
            <input
              className="form-input"
              placeholder="Rechercher un client, une adresse, un problème…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="pill-toggle">
            {STATUS_FILTERS.map((f) => (
              <button key={f.value} type="button" className={status === f.value ? "active" : ""} onClick={() => setStatusFilter(f.value)}>
                {f.label}
              </button>
            ))}
          </div>
          <select className="form-select" value={priority} onChange={(e) => setPriority(e.target.value as CasePriority | "")}>
            <option value="">Toutes priorités</option>
            <option value="URGENT">Urgente</option>
            <option value="HIGH">Haute</option>
            <option value="MEDIUM">Moyenne</option>
            <option value="LOW">Basse</option>
          </select>
        </div>
      </div>

      {casesQuery.isLoading ? (
        <LoadingState label="Chargement des dossiers…" />
      ) : casesQuery.isError ? (
        <ErrorState error={casesQuery.error} onRetry={() => void casesQuery.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Aucun dossier trouvé"
          description="Ajustez vos filtres ou créez un nouveau dossier."
          action={
            <Link to="/dossiers/nouveau" className="btn btn--primary" style={{ marginTop: 8 }}>
              <IconPlus /> Nouveau dossier
            </Link>
          }
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="sortable" onClick={() => toggleSort("customer")}>
                  Client{sortKey === "customer" && <SortCaret dir={sortDir} />}
                </th>
                <th>Propriété / Ville</th>
                <th>Problème</th>
                <th className="sortable" onClick={() => toggleSort("status")}>
                  Statut{sortKey === "status" && <SortCaret dir={sortDir} />}
                </th>
                <th className="sortable" onClick={() => toggleSort("priority")}>
                  Priorité{sortKey === "priority" && <SortCaret dir={sortDir} />}
                </th>
                <th>Intervenant</th>
                <th>Prochaine visite</th>
                <th className="sortable" onClick={() => toggleSort("updatedAt")}>
                  Dernière activité{sortKey === "updatedAt" && <SortCaret dir={sortDir} />}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((kase) => (
                <CaseRow key={kase.id} kase={kase} nextVisit={nextVisitByCase.get(kase.id)} onOpen={openCase} />
              ))}
            </tbody>
          </table>
          {casesQuery.data && casesQuery.data.total > casesQuery.data.pageSize && (
            <div className="table-footer">
              <span>
                Page {casesQuery.data.page} sur {Math.ceil(casesQuery.data.total / casesQuery.data.pageSize)}
              </span>
              <div className="flex-row">
                <button className="btn btn--sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                  Précédent
                </button>
                <button
                  className="btn btn--sm"
                  disabled={page * casesQuery.data.pageSize >= casesQuery.data.total}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Suivant
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SortCaret({ dir }: { dir: "asc" | "desc" }) {
  return <span className="sort-caret">{dir === "asc" ? "▲" : "▼"}</span>;
}

function CaseRow({
  kase,
  nextVisit,
  onOpen,
}: {
  kase: CaseListItem;
  nextVisit: VisitDetail | undefined;
  onOpen: (id: string) => void;
}) {
  return (
    <tr key={kase.id} onClick={() => onOpen(kase.id)}>
      <td>
        <div className="cell-primary">{fullName(kase.customer)}</div>
        <div className="cell-secondary">{kase.customer.phone}</div>
      </td>
      <td>
        <div>{kase.property.city}</div>
        <div className="cell-secondary">{kase.property.address}</div>
      </td>
      <td style={{ maxWidth: 260 }}>
        <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={kase.problemDescription}>
          {kase.problemDescription}
        </div>
      </td>
      <td className="nowrap">
        <CaseStatusBadge status={kase.status} />
      </td>
      <td className="nowrap">
        <PriorityBadge priority={kase.priority} />
      </td>
      <td className="nowrap">{nextVisit?.assignedWorker ? fullName(nextVisit.assignedWorker) : <span className="muted">—</span>}</td>
      <td className="nowrap">{nextVisit ? formatRelativeDay(nextVisit.scheduledAt) : <span className="muted">—</span>}</td>
      <td className="nowrap muted">{formatTimeAgo(kase.updatedAt)}</td>
    </tr>
  );
}
