import { useState } from "react";
import type { VisitStatus } from "@msph/shared";
import { useUpdateVisitMutation } from "../../api/visits.js";
import type { CaseVisit } from "../../api/cases.js";
import { useWorkersQuery } from "../../api/users.js";
import { Modal } from "../../components/Modal.js";
import { FormField } from "../../components/FormField.js";
import { useToast } from "../../components/ToastProvider.js";
import { fullName } from "../../lib/format.js";
import { VISIT_STATUS_LABELS_FR } from "../../lib/labels.js";

const EDITABLE_STATUSES: VisitStatus[] = ["SCHEDULED", "IN_PROGRESS", "CANCELLED", "NO_SHOW"];

/** Reschedule / reassign / edit notes / cancel — the ADMIN-only general
 * PATCH (see CONTEXT.md 8: workers change a visit's status only via
 * start/complete, never through this route). */
export function EditVisitModal({ visit, caseId, onClose }: { visit: CaseVisit; caseId: string; onClose: () => void }) {
  const { showToast, showError } = useToast();
  const updateVisit = useUpdateVisitMutation(caseId);

  const scheduled = new Date(visit.scheduledAt);
  const [date, setDate] = useState(scheduled.toISOString().slice(0, 10));
  const [time, setTime] = useState(scheduled.toISOString().slice(11, 16));
  const [assignedWorkerId, setAssignedWorkerId] = useState(visit.assignedWorkerId ?? "");
  const [status, setStatus] = useState<VisitStatus>(visit.status);
  const [notes, setNotes] = useState(visit.notes ?? "");
  const workersQuery = useWorkersQuery();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await updateVisit.mutateAsync({
        id: visit.id,
        input: {
          scheduledAt: new Date(`${date}T${time}`).toISOString(),
          assignedWorkerId: assignedWorkerId || null,
          status,
          notes: notes || undefined,
        },
      });
      showToast("Visite mise à jour.", "success");
      onClose();
    } catch (err) {
      showError(err, "Impossible de mettre à jour la visite.");
    }
  }

  return (
    <Modal title="Modifier la visite" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <div className="form-grid">
          <FormField label="Date">
            <input type="date" className="form-input" value={date} onChange={(e) => setDate(e.target.value)} />
          </FormField>
          <FormField label="Heure">
            <input type="time" className="form-input" value={time} onChange={(e) => setTime(e.target.value)} />
          </FormField>
          <FormField label="Intervenant assigné" optional>
            <select className="form-select" value={assignedWorkerId} onChange={(e) => setAssignedWorkerId(e.target.value)}>
              <option value="">Non assigné</option>
              {workersQuery.data?.items.map((w) => (
                <option key={w.id} value={w.id}>
                  {fullName(w)}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Statut">
            <select className="form-select" value={status} onChange={(e) => setStatus(e.target.value as VisitStatus)}>
              {EDITABLE_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {VISIT_STATUS_LABELS_FR[s]}
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
          <button type="submit" className="btn btn--primary" disabled={updateVisit.isPending}>
            {updateVisit.isPending ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
