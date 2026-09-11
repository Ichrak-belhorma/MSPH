import { useState } from "react";
import { useTreatmentsQuery } from "../../api/treatments.js";
import { useAddTreatmentMutation } from "../../api/cases.js";
import { Modal } from "../../components/Modal.js";
import { FormField } from "../../components/FormField.js";
import { useToast } from "../../components/ToastProvider.js";

export function TreatmentPickerModal({ caseId, onClose }: { caseId: string; onClose: () => void }) {
  const { showToast, showError } = useToast();
  const treatmentsQuery = useTreatmentsQuery({ active: true, pageSize: 100 });
  const addTreatment = useAddTreatmentMutation(caseId);
  const [treatmentId, setTreatmentId] = useState("");
  const [notes, setNotes] = useState("");

  const selected = treatmentsQuery.data?.items.find((t) => t.id === treatmentId);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!treatmentId) return;
    try {
      await addTreatment.mutateAsync({ treatmentId, notes: notes || undefined });
      showToast("Traitement ajouté au dossier.", "success");
      onClose();
    } catch (err) {
      showError(err, "Impossible d'ajouter le traitement.");
    }
  }

  return (
    <Modal title="Choisir un traitement" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Traitement">
          <select className="form-select" value={treatmentId} onChange={(e) => setTreatmentId(e.target.value)} required>
            <option value="">Sélectionner un traitement…</option>
            {treatmentsQuery.data?.items.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </FormField>
        {selected && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="card__body" style={{ fontSize: 12.5 }}>
              {selected.description && <p style={{ marginBottom: 6 }}>{selected.description}</p>}
              {selected.durationMinutes && (
                <p className="muted">Durée estimée : {selected.durationMinutes} min</p>
              )}
              {selected.safetyInformation && (
                <p className="muted" style={{ marginTop: 6 }}>
                  ⚠ {selected.safetyInformation}
                </p>
              )}
            </div>
          </div>
        )}
        <FormField label="Notes" optional>
          <textarea className="form-textarea" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </FormField>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={addTreatment.isPending || !treatmentId}>
            {addTreatment.isPending ? "Ajout…" : "Ajouter au dossier"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
