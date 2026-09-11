import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import { useVisitsQuery, type VisitDetail } from "../../api/visits.js";
import { useWorkersQuery } from "../../api/users.js";
import { Modal } from "../../components/Modal.js";
import { LoadingState } from "../../components/States.js";
import { VisitStatusBadge } from "../../components/Badge.js";
import { IconChevronLeft, IconChevronRight } from "../../components/icons.js";
import { formatDateTime, fullName } from "../../lib/format.js";
import { VISIT_TYPE_LABELS_FR } from "../../lib/labels.js";
import { EditVisitModal } from "../cases/EditVisitModal.js";

const WEEKDAYS_FR = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function CalendarPage() {
  const [cursor, setCursor] = useState(() => new Date());
  const [workerId, setWorkerId] = useState("");
  const [preview, setPreview] = useState<VisitDetail | null>(null);
  const [editing, setEditing] = useState<VisitDetail | null>(null);
  const navigate = useNavigate();
  const workersQuery = useWorkersQuery();

  const monthStart = startOfMonth(cursor);
  const monthEnd = endOfMonth(cursor);
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = useMemo(() => eachDayOfInterval({ start: gridStart, end: gridEnd }), [gridStart, gridEnd]);

  const visitsQuery = useVisitsQuery({
    from: gridStart.toISOString(),
    to: gridEnd.toISOString(),
    assignedWorkerId: workerId || undefined,
    // 100 is the API's hard pageSize cap (see paginationQuerySchema) —
    // covers a full 6-week grid comfortably at this company's scale.
    pageSize: 100,
  });

  const visitsByDay = useMemo(() => {
    const map = new Map<string, VisitDetail[]>();
    for (const visit of visitsQuery.data?.items ?? []) {
      const key = format(new Date(visit.scheduledAt), "yyyy-MM-dd");
      const list = map.get(key) ?? [];
      list.push(visit);
      map.set(key, list);
    }
    for (const list of map.values()) list.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
    return map;
  }, [visitsQuery.data]);

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Calendrier</h1>
          <p className="page-header__subtitle">Consultations et interventions planifiées.</p>
        </div>
        <div className="page-header__actions">
          <select className="form-select" value={workerId} onChange={(e) => setWorkerId(e.target.value)}>
            <option value="">Tous les intervenants</option>
            {workersQuery.data?.items.map((w) => (
              <option key={w.id} value={w.id}>
                {fullName(w)}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="calendar-toolbar">
        <div className="calendar-toolbar__nav">
          <button type="button" className="btn btn--icon btn--sm" onClick={() => setCursor((c) => subMonths(c, 1))}>
            <IconChevronLeft style={{ width: 15, height: 15 }} />
          </button>
          <span className="calendar-toolbar__label">{format(cursor, "MMMM yyyy", { locale: fr })}</span>
          <button type="button" className="btn btn--icon btn--sm" onClick={() => setCursor((c) => addMonths(c, 1))}>
            <IconChevronRight style={{ width: 15, height: 15 }} />
          </button>
        </div>
        <button type="button" className="btn btn--sm" onClick={() => setCursor(new Date())}>
          Aujourd'hui
        </button>
      </div>

      {visitsQuery.isLoading ? (
        <LoadingState label="Chargement du calendrier…" />
      ) : (
        <div className="calendar-grid">
          {WEEKDAYS_FR.map((d) => (
            <div className="calendar-weekday" key={d}>
              {d}
            </div>
          ))}
          {days.map((day) => {
            const key = format(day, "yyyy-MM-dd");
            const events = visitsByDay.get(key) ?? [];
            const outside = !isSameMonth(day, cursor);
            return (
              <div className={`calendar-cell ${outside ? "outside" : ""} ${isToday(day) ? "today" : ""}`} key={key}>
                <span className="calendar-cell__date">{format(day, "d")}</span>
                {events.slice(0, 4).map((visit) => (
                  <button
                    key={visit.id}
                    type="button"
                    className={`calendar-event status-${visit.status.toLowerCase()}`}
                    onClick={() => setPreview(visit)}
                    title={`${fullName(visit.case.customer)} — ${VISIT_TYPE_LABELS_FR[visit.type]}`}
                  >
                    {format(new Date(visit.scheduledAt), "HH:mm")} {fullName(visit.case.customer)}
                  </button>
                ))}
                {events.length > 4 && <span className="calendar-event__more">+{events.length - 4} autre(s)</span>}
              </div>
            );
          })}
        </div>
      )}

      {preview && !editing && (
        <Modal title={VISIT_TYPE_LABELS_FR[preview.type]} onClose={() => setPreview(null)}>
          <div style={{ marginBottom: 14 }}>
            <VisitStatusBadge status={preview.status} />
          </div>
          <div className="info-row">
            <span className="info-row__label">Client</span>
            <span className="info-row__value">{fullName(preview.case.customer)}</span>
          </div>
          <div className="info-row">
            <span className="info-row__label">Propriété</span>
            <span className="info-row__value">
              {preview.case.property.address}, {preview.case.property.city}
            </span>
          </div>
          <div className="info-row">
            <span className="info-row__label">Date</span>
            <span className="info-row__value">{formatDateTime(preview.scheduledAt)}</span>
          </div>
          <div className="info-row">
            <span className="info-row__label">Intervenant</span>
            <span className="info-row__value">{preview.assignedWorker ? fullName(preview.assignedWorker) : "Non assigné"}</span>
          </div>
          <div className="form-actions">
            {preview.status !== "COMPLETED" && preview.status !== "CANCELLED" && (
              <button type="button" className="btn" onClick={() => setEditing(preview)}>
                Reprogrammer
              </button>
            )}
            <button type="button" className="btn btn--primary" onClick={() => navigate(`/dossiers/${preview.caseId}`)}>
              Voir le dossier
            </button>
          </div>
        </Modal>
      )}

      {editing && (
        <EditVisitModal
          visit={editing}
          caseId={editing.caseId}
          onClose={() => {
            setEditing(null);
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
