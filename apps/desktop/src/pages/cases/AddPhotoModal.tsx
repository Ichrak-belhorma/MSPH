import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { addVisitPhoto } from "../../api/visits.js";
import { queryKeys } from "../../api/queryKeys.js";
import { Modal } from "../../components/Modal.js";
import { FormField } from "../../components/FormField.js";
import { useToast } from "../../components/ToastProvider.js";

/**
 * Registers photo *metadata* only — there is no binary file storage yet
 * (see CONTEXT.md "File storage"), so this is honest about it rather
 * than pretending to be a real upload: the manager enters a reference
 * and a caption, which is exactly what `POST /visits/:id/photos`
 * accepts today. Wiring a real "choose file" picker belongs with the
 * storage driver work, not before it exists.
 */
export function AddPhotoModal({ visitId, caseId, onClose }: { visitId: string; caseId: string; onClose: () => void }) {
  const { showToast, showError } = useToast();
  const queryClient = useQueryClient();
  const [storageKey, setStorageKey] = useState("");
  const [caption, setCaption] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!storageKey.trim()) return;
    setSubmitting(true);
    try {
      await addVisitPhoto(visitId, { storageKey: storageKey.trim(), caption: caption || undefined });
      void queryClient.invalidateQueries({ queryKey: queryKeys.cases.detail(caseId) });
      showToast("Photo ajoutée.", "success");
      onClose();
    } catch (err) {
      showError(err, "Impossible d'ajouter la photo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Ajouter une photo" onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <p className="muted" style={{ fontSize: 12.5, marginBottom: 14 }}>
          Le stockage réel des fichiers n'est pas encore disponible — cette référence permet de suivre les photos prises sur
          le terrain en attendant.
        </p>
        <FormField label="Référence du fichier" hint="Nom ou identifiant du fichier photo">
          <input className="form-input" value={storageKey} onChange={(e) => setStorageKey(e.target.value)} required />
        </FormField>
        <FormField label="Légende" optional>
          <input className="form-input" value={caption} onChange={(e) => setCaption(e.target.value)} />
        </FormField>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? "Ajout…" : "Ajouter"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
