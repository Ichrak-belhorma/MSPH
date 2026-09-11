import { useState } from "react";
import { useCompleteVisitMutation } from "../../api/visits.js";
import type { CaseVisit } from "../../api/cases.js";
import { Modal } from "../../components/Modal.js";
import { FormField } from "../../components/FormField.js";
import { useToast } from "../../components/ToastProvider.js";

/** "Terminer la visite" — captures the inspection in the same step, same
 * as the mobile app's flow (POST /visits/:id/complete accepts the
 * inspection fields inline). Everything optional: a pure treatment visit
 * might not need an inspection recorded. */
export function CompleteVisitModal({ visit, caseId, onClose }: { visit: CaseVisit; caseId: string; onClose: () => void }) {
  const { showToast, showError } = useToast();
  const completeVisit = useCompleteVisitMutation(caseId);

  const [observations, setObservations] = useState(visit.inspection?.observations ?? "");
  const [remarks, setRemarks] = useState(visit.inspection?.remarks ?? "");
  const [condition, setCondition] = useState(visit.inspection?.condition ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await completeVisit.mutateAsync({
        id: visit.id,
        input: {
          observations: observations || undefined,
          remarks: remarks || undefined,
          condition: condition || undefined,
        },
      });
      showToast("Visite terminée.", "success");
      onClose();
    } catch (err) {
      showError(err, "Impossible de terminer la visite.");
    }
  }

  return (
    <Modal title="Terminer la visite" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          Renseignez les observations relevées sur place. Ces champs sont optionnels.
        </p>
        <FormField label="État de la propriété" optional hint="Ex : activité modérée de cafards, aucune trace constatée…">
          <input className="form-input" value={condition} onChange={(e) => setCondition(e.target.value)} />
        </FormField>
        <FormField label="Observations" optional>
          <textarea className="form-textarea" rows={3} value={observations} onChange={(e) => setObservations(e.target.value)} />
        </FormField>
        <FormField label="Remarques" optional>
          <textarea className="form-textarea" rows={2} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
        </FormField>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={completeVisit.isPending}>
            {completeVisit.isPending ? "Enregistrement…" : "Terminer la visite"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
