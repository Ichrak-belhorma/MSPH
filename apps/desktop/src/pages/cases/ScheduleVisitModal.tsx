import { useState } from "react";
import type { VisitType } from "@msph/shared";
import { useScheduleVisitMutation } from "../../api/visits.js";
import { useWorkersQuery } from "../../api/users.js";
import { Modal } from "../../components/Modal.js";
import { FormField } from "../../components/FormField.js";
import { useToast } from "../../components/ToastProvider.js";
import { fullName } from "../../lib/format.js";
import { VISIT_TYPE_LABELS_FR } from "../../lib/labels.js";

const VISIT_TYPES: VisitType[] = ["INITIAL_INSPECTION", "TREATMENT", "FOLLOW_UP", "OTHER"];

export function ScheduleVisitModal({
  caseId,
  defaultType = "FOLLOW_UP",
  onClose,
}: {
  caseId: string;
  defaultType?: VisitType;
  onClose: () => void;
}) {
  const { showToast, showError } = useToast();
  const scheduleVisit = useScheduleVisitMutation(caseId);
  const workersQuery = useWorkersQuery();

  const [type, setType] = useState<VisitType>(defaultType);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("09:00");
  const [assignedWorkerId, setAssignedWorkerId] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!date) {
      setError("Choisissez une date.");
      return;
    }
    try {
      await scheduleVisit.mutateAsync({
        caseId,
        type,
        scheduledAt: new Date(`${date}T${time}`).toISOString(),
        assignedWorkerId: assignedWorkerId || undefined,
        notes: notes || undefined,
      });
      showToast("Visite planifiée.", "success");
      onClose();
    } catch (err) {
      showError(err, "Impossible de planifier la visite.");
    }
  }

  return (
    <Modal title="Planifier une visite" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Type de visite">
          <div className="radio-group">
            {VISIT_TYPES.map((t) => (
              <button key={t} type="button" className={`radio-chip ${type === t ? "active" : ""}`} onClick={() => setType(t)}>
                {VISIT_TYPE_LABELS_FR[t]}
              </button>
            ))}
          </div>
        </FormField>
        <div className="form-grid">
          <FormField label="Date" error={error ?? undefined}>
            <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Heure">
            <input type="time" className="form-input" value={time} onChange={(e) => setTime(e.target.value)} />
          </FormField>
          <FormField label="Intervenant assigné" optional span2>
            <select className="form-select" value={assignedWorkerId} onChange={(e) => setAssignedWorkerId(e.target.value)}>
              <option value="">À assigner plus tard</option>
              {workersQuery.data?.items.map((w) => (
                <option key={w.id} value={w.id}>
                  {fullName(w)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Notes" optional span2>
            <textarea className="form-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </FormField>
        </div>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={scheduleVisit.isPending}>
            {scheduleVisit.isPending ? "Planification…" : "Planifier"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
