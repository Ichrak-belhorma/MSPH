import { useEffect, useState } from "react";
import { createTreatmentSchema, type Treatment } from "@msph/shared";
import { useCreateTreatmentMutation, useTreatmentsQuery, useUpdateTreatmentMutation } from "../../api/treatments.js";
import { Badge } from "../../components/Badge.js";
import { Drawer } from "../../components/Drawer.js";
import { FormField } from "../../components/FormField.js";
import { EmptyState, ErrorState, LoadingState } from "../../components/States.js";
import { useToast } from "../../components/ToastProvider.js";
import { fieldErrors } from "../../lib/formErrors.js";
import { IconPlus, IconSearch } from "../../components/icons.js";

export function TreatmentsPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Treatment | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const treatmentsQuery = useTreatmentsQuery({ search: debounced || undefined, active: showInactive ? undefined : true, pageSize: 100 });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Traitements</h1>
          <p className="page-header__subtitle">Catalogue des procédures de traitement.</p>
        </div>
        <div className="page-header__actions">
          <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
            <IconPlus /> Nouveau traitement
          </button>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="table-toolbar__filters">
          <div className="search-input-wrap">
            <IconSearch className="icon" />
            <input className="form-input" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <label className="checkbox-row">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Afficher les traitements désactivés
          </label>
        </div>
      </div>

      {treatmentsQuery.isLoading ? (
        <LoadingState />
      ) : treatmentsQuery.isError ? (
        <ErrorState error={treatmentsQuery.error} onRetry={() => void treatmentsQuery.refetch()} />
      ) : treatmentsQuery.data!.items.length === 0 ? (
        <EmptyState title="Aucun traitement" description="Ajoutez un premier traitement au catalogue." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Description</th>
                <th>Durée</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {treatmentsQuery.data!.items.map((t) => (
                <tr key={t.id} onClick={() => setEditing(t)}>
                  <td className="cell-primary">{t.name}</td>
                  <td style={{ maxWidth: 320 }}>
                    <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.description ?? "—"}</div>
                  </td>
                  <td className="nowrap">{t.durationMinutes ? `${t.durationMinutes} min` : "—"}</td>
                  <td className="nowrap">
                    <Badge tone={t.active ? "success" : "neutral"}>{t.active ? "Actif" : "Désactivé"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <TreatmentFormDrawer
          treatment={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function TreatmentFormDrawer({ treatment, onClose }: { treatment: Treatment | null; onClose: () => void }) {
  const { showToast, showError } = useToast();
  const createTreatment = useCreateTreatmentMutation();
  const updateTreatment = useUpdateTreatmentMutation();

  const [form, setForm] = useState({
    name: treatment?.name ?? "",
    description: treatment?.description ?? "",
    instructions: treatment?.instructions ?? "",
    durationMinutes: treatment?.durationMinutes?.toString() ?? "",
    safetyInformation: treatment?.safetyInformation ?? "",
    notes: treatment?.notes ?? "",
    active: treatment?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const busy = createTreatment.isPending || updateTreatment.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      description: form.description || undefined,
      instructions: form.instructions || undefined,
      durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
      safetyInformation: form.safetyInformation || undefined,
      notes: form.notes || undefined,
      active: form.active,
    };
    const parsed = createTreatmentSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    try {
      if (treatment) {
        await updateTreatment.mutateAsync({ id: treatment.id, input: parsed.data });
        showToast("Traitement mis à jour.", "success");
      } else {
        await createTreatment.mutateAsync(parsed.data);
        showToast("Traitement créé.", "success");
      }
      onClose();
    } catch (err) {
      showError(err, "Impossible d'enregistrer le traitement.");
    }
  }

  return (
    <Drawer title={treatment ? "Modifier le traitement" : "Nouveau traitement"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Nom" error={errors.name}>
          <input className="form-input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </FormField>
        <FormField label="Description" optional>
          <textarea className="form-textarea" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </FormField>
        <FormField label="Instructions" optional>
          <textarea className="form-textarea" rows={3} value={form.instructions} onChange={(e) => setForm({ ...form, instructions: e.target.value })} />
        </FormField>
        <FormField label="Durée (minutes)" optional error={errors.durationMinutes}>
          <input type="number" min={1} className="form-input" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} />
        </FormField>
        <FormField label="Consignes de sécurité" optional>
          <textarea className="form-textarea" rows={2} value={form.safetyInformation} onChange={(e) => setForm({ ...form, safetyInformation: e.target.value })} />
        </FormField>
        <FormField label="Notes" optional>
          <textarea className="form-textarea" rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        </FormField>
        <label className="checkbox-row" style={{ marginBottom: 16 }}>
          <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
          Traitement actif (visible dans le sélecteur de dossier)
        </label>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </form>
    </Drawer>
  );
}
