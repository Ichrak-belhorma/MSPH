import { useEffect, useState } from "react";
import { createPropertySchema } from "@msph/shared";
import type { Landlord } from "@msph/shared";
import { createLandlord, useLandlordsQuery } from "../../api/landlords.js";
import { useCreatePropertyMutation, useProperties, useUpdatePropertyMutation, type PropertyWithLandlord } from "../../api/properties.js";
import { Drawer } from "../../components/Drawer.js";
import { FormField } from "../../components/FormField.js";
import { SearchSelect } from "../../components/SearchSelect.js";
import { EmptyState, ErrorState, LoadingState } from "../../components/States.js";
import { useToast } from "../../components/ToastProvider.js";
import { fieldErrors } from "../../lib/formErrors.js";
import { fullName } from "../../lib/format.js";
import { IconPlus, IconSearch } from "../../components/icons.js";

export function PropertiesPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [editing, setEditing] = useState<PropertyWithLandlord | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const propertiesQuery = useProperties({ search: debounced || undefined, pageSize: 50 });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Propriétés</h1>
          <p className="page-header__subtitle">{propertiesQuery.data ? `${propertiesQuery.data.total} propriété(s)` : " "}</p>
        </div>
        <div className="page-header__actions">
          <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
            <IconPlus /> Nouvelle propriété
          </button>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="search-input-wrap">
          <IconSearch className="icon" />
          <input className="form-input" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {propertiesQuery.isLoading ? (
        <LoadingState />
      ) : propertiesQuery.isError ? (
        <ErrorState error={propertiesQuery.error} onRetry={() => void propertiesQuery.refetch()} />
      ) : propertiesQuery.data!.items.length === 0 ? (
        <EmptyState title="Aucune propriété" description="Les propriétés apparaissent ici une fois créées (directement, ou via un nouveau dossier)." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Adresse</th>
                <th>Ville</th>
                <th>Code postal</th>
                <th>Bailleur</th>
              </tr>
            </thead>
            <tbody>
              {propertiesQuery.data!.items.map((p) => (
                <tr key={p.id} onClick={() => setEditing(p)}>
                  <td className="cell-primary">{p.address}</td>
                  <td>{p.city}</td>
                  <td>{p.postalCode}</td>
                  <td>{p.landlord ? fullName(p.landlord) : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <PropertyFormDrawer
          property={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function PropertyFormDrawer({ property, onClose }: { property: PropertyWithLandlord | null; onClose: () => void }) {
  const { showToast, showError } = useToast();
  const createProperty = useCreatePropertyMutation();
  const updateProperty = useUpdatePropertyMutation();

  const [form, setForm] = useState({
    address: property?.address ?? "",
    city: property?.city ?? "",
    postalCode: property?.postalCode ?? "",
  });
  const [landlordMode, setLandlordMode] = useState<"none" | "existing" | "new">(property?.landlord ? "existing" : "none");
  const [selectedLandlord, setSelectedLandlord] = useState<Landlord | null>(property?.landlord ?? null);
  const [landlordSearch, setLandlordSearch] = useState("");
  const landlordsQuery = useLandlordsQuery({ search: landlordSearch, pageSize: 8 });
  const [newLandlord, setNewLandlord] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const busy = createProperty.isPending || updateProperty.isPending;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    let landlordId: string | null | undefined = property?.landlordId ?? undefined;
    if (landlordMode === "existing") {
      landlordId = selectedLandlord?.id;
    } else if (landlordMode === "none") {
      landlordId = null;
    }

    try {
      if (landlordMode === "new" && (newLandlord.firstName || newLandlord.lastName)) {
        const created = await createLandlord({
          firstName: newLandlord.firstName,
          lastName: newLandlord.lastName,
          phone: newLandlord.phone || undefined,
          email: newLandlord.email || undefined,
        });
        landlordId = created.id;
      }

      const payload = { ...form, landlordId: landlordId ?? undefined };
      const parsed = createPropertySchema.safeParse(payload);
      if (!parsed.success) {
        setErrors(fieldErrors(parsed.error));
        return;
      }

      if (property) {
        await updateProperty.mutateAsync({ id: property.id, input: { ...parsed.data, landlordId: landlordId ?? null } });
        showToast("Propriété mise à jour.", "success");
      } else {
        await createProperty.mutateAsync(parsed.data);
        showToast("Propriété créée.", "success");
      }
      onClose();
    } catch (err) {
      showError(err, "Impossible d'enregistrer la propriété.");
    }
  }

  return (
    <Drawer title={property ? "Modifier la propriété" : "Nouvelle propriété"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Adresse" error={errors.address}>
          <input className="form-input" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </FormField>
        <FormField label="Ville" error={errors.city}>
          <input className="form-input" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        </FormField>
        <FormField label="Code postal" error={errors.postalCode}>
          <input className="form-input" value={form.postalCode} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
        </FormField>

        <div className="form-label" style={{ marginBottom: 8 }}>
          Bailleur
        </div>
        <div className="radio-group" style={{ marginBottom: 10 }}>
          {(["none", "existing", "new"] as const).map((m) => (
            <button key={m} type="button" className={`radio-chip ${landlordMode === m ? "active" : ""}`} onClick={() => setLandlordMode(m)}>
              {m === "none" ? "Aucun" : m === "existing" ? "Existant" : "Nouveau"}
            </button>
          ))}
        </div>
        {landlordMode === "existing" && (
          <FormField label="Rechercher un bailleur">
            <SearchSelect
              items={landlordsQuery.data?.items ?? []}
              loading={landlordsQuery.isLoading}
              search={landlordSearch}
              onSearchChange={setLandlordSearch}
              selected={selectedLandlord}
              onSelect={setSelectedLandlord}
              getId={(l) => l.id}
              getLabel={(l) => fullName(l)}
              getSubLabel={(l) => l.phone ?? ""}
            />
          </FormField>
        )}
        {landlordMode === "new" && (
          <div className="form-grid">
            <FormField label="Prénom">
              <input className="form-input" value={newLandlord.firstName} onChange={(e) => setNewLandlord({ ...newLandlord, firstName: e.target.value })} />
            </FormField>
            <FormField label="Nom">
              <input className="form-input" value={newLandlord.lastName} onChange={(e) => setNewLandlord({ ...newLandlord, lastName: e.target.value })} />
            </FormField>
            <FormField label="Téléphone" optional>
              <input className="form-input" value={newLandlord.phone} onChange={(e) => setNewLandlord({ ...newLandlord, phone: e.target.value })} />
            </FormField>
            <FormField label="E-mail" optional>
              <input className="form-input" type="email" value={newLandlord.email} onChange={(e) => setNewLandlord({ ...newLandlord, email: e.target.value })} />
            </FormField>
          </div>
        )}

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
