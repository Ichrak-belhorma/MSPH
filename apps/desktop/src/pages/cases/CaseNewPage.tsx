import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createCaseSchema, type CasePriority, type CreateCaseInput } from "@msph/shared";
import type { Customer, Landlord } from "@msph/shared";
import { useCreateCaseMutation } from "../../api/cases.js";
import { useCustomersQuery } from "../../api/customers.js";
import { useLandlordsQuery } from "../../api/landlords.js";
import { type PropertyWithLandlord, listProperties } from "../../api/properties.js";
import { useQuery } from "@tanstack/react-query";
import { useWorkersQuery } from "../../api/users.js";
import { FormField } from "../../components/FormField.js";
import { SearchSelect } from "../../components/SearchSelect.js";
import { useToast } from "../../components/ToastProvider.js";
import { fullName } from "../../lib/format.js";
import { fieldErrors } from "../../lib/formErrors.js";

type Mode = "new" | "existing";

export function CaseNewPage() {
  const navigate = useNavigate();
  const { showToast, showError } = useToast();
  const createCase = useCreateCaseMutation();

  // Customer
  const [customerMode, setCustomerMode] = useState<Mode>("new");
  const [customer, setCustomer] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const customersQuery = useCustomersQuery({ search: customerSearch, pageSize: 8 });

  // Property
  const [propertyMode, setPropertyMode] = useState<Mode>("new");
  const [property, setProperty] = useState({ address: "", city: "", postalCode: "" });
  const [selectedProperty, setSelectedProperty] = useState<PropertyWithLandlord | null>(null);
  const [propertySearch, setPropertySearch] = useState("");
  const propertiesQuery = useQuery({
    queryKey: ["properties", "list", { search: propertySearch, pageSize: 8 }],
    queryFn: () => listProperties({ search: propertySearch, pageSize: 8 }),
  });

  // Landlord (only relevant when creating a new property)
  const [landlordMode, setLandlordMode] = useState<"none" | Mode>("none");
  const [landlord, setLandlord] = useState({ firstName: "", lastName: "", phone: "", email: "" });
  const [selectedLandlord, setSelectedLandlord] = useState<Landlord | null>(null);
  const [landlordSearch, setLandlordSearch] = useState("");
  const landlordsQuery = useLandlordsQuery({ search: landlordSearch, pageSize: 8 });

  // Problem
  const [problemDescription, setProblemDescription] = useState("");
  const [priority, setPriority] = useState<CasePriority>("MEDIUM");

  // Initial consultation
  const [scheduleNow, setScheduleNow] = useState(true);
  const [visitDate, setVisitDate] = useState("");
  const [visitTime, setVisitTime] = useState("09:00");
  const [assignedWorkerId, setAssignedWorkerId] = useState("");
  const workersQuery = useWorkersQuery();

  const [errors, setErrors] = useState<Record<string, string>>({});

  function buildPayload(): CreateCaseInput | null {
    const payload: Record<string, unknown> = {
      problemDescription,
      priority,
    };

    if (customerMode === "existing" && selectedCustomer) {
      payload.customerId = selectedCustomer.id;
    } else {
      payload.customer = { ...customer, email: customer.email || undefined };
    }

    if (propertyMode === "existing" && selectedProperty) {
      payload.propertyId = selectedProperty.id;
    } else {
      const propertyPayload: Record<string, unknown> = { ...property };
      if (landlordMode === "existing" && selectedLandlord) {
        propertyPayload.landlordId = selectedLandlord.id;
      } else if (landlordMode === "new") {
        propertyPayload.landlord = {
          ...landlord,
          phone: landlord.phone || undefined,
          email: landlord.email || undefined,
        };
      }
      payload.property = propertyPayload;
    }

    if (scheduleNow && visitDate) {
      payload.initialVisitScheduledAt = new Date(`${visitDate}T${visitTime}`).toISOString();
      if (assignedWorkerId) payload.assignedWorkerId = assignedWorkerId;
    }

    const parsed = createCaseSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return null;
    }
    setErrors({});
    return parsed.data;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildPayload();
    if (!payload) {
      showToast("Le formulaire contient des erreurs.", "error");
      return;
    }
    try {
      const created = await createCase.mutateAsync(payload);
      showToast("Dossier créé avec succès.", "success");
      navigate(`/dossiers/${created.id}`);
    } catch (err) {
      showError(err, "Impossible de créer le dossier.");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Nouveau dossier</h1>
          <p className="page-header__subtitle">Saisissez les informations transmises par le client.</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ maxWidth: 760 }}>
        {/* --- Client --- */}
        <div className="form-section">
          <div className="flex-between form-section__title" style={{ border: "none", padding: 0, marginBottom: 10 }}>
            <span>Client</span>
            <ModeToggle mode={customerMode} onChange={setCustomerMode} labels={["Nouveau client", "Client existant"]} />
          </div>
          {customerMode === "existing" ? (
            <FormField label="Rechercher un client">
              <SearchSelect
                items={customersQuery.data?.items ?? []}
                loading={customersQuery.isLoading}
                search={customerSearch}
                onSearchChange={setCustomerSearch}
                selected={selectedCustomer}
                onSelect={setSelectedCustomer}
                getId={(c) => c.id}
                getLabel={(c) => fullName(c)}
                getSubLabel={(c) => c.phone}
                placeholder="Nom, prénom ou téléphone…"
              />
            </FormField>
          ) : (
            <div className="form-grid">
              <FormField label="Prénom" error={errors["customer.firstName"]}>
                <input className="form-input" value={customer.firstName} onChange={(e) => setCustomer({ ...customer, firstName: e.target.value })} />
              </FormField>
              <FormField label="Nom" error={errors["customer.lastName"]}>
                <input className="form-input" value={customer.lastName} onChange={(e) => setCustomer({ ...customer, lastName: e.target.value })} />
              </FormField>
              <FormField label="Téléphone" error={errors["customer.phone"]}>
                <input className="form-input" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} />
              </FormField>
              <FormField label="E-mail" optional error={errors["customer.email"]}>
                <input className="form-input" type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} />
              </FormField>
            </div>
          )}
        </div>

        {/* --- Property --- */}
        <div className="form-section">
          <div className="flex-between form-section__title" style={{ border: "none", padding: 0, marginBottom: 10 }}>
            <span>Propriété</span>
            <ModeToggle mode={propertyMode} onChange={setPropertyMode} labels={["Nouvelle propriété", "Propriété existante"]} />
          </div>
          {propertyMode === "existing" ? (
            <FormField label="Rechercher une propriété">
              <SearchSelect
                items={propertiesQuery.data?.items ?? []}
                loading={propertiesQuery.isLoading}
                search={propertySearch}
                onSearchChange={setPropertySearch}
                selected={selectedProperty}
                onSelect={setSelectedProperty}
                getId={(p) => p.id}
                getLabel={(p) => p.address}
                getSubLabel={(p) => p.city}
                placeholder="Adresse ou ville…"
              />
            </FormField>
          ) : (
            <>
              <div className="form-grid">
                <FormField label="Adresse" span2 error={errors["property.address"]}>
                  <input className="form-input" value={property.address} onChange={(e) => setProperty({ ...property, address: e.target.value })} />
                </FormField>
                <FormField label="Ville" error={errors["property.city"]}>
                  <input className="form-input" value={property.city} onChange={(e) => setProperty({ ...property, city: e.target.value })} />
                </FormField>
                <FormField label="Code postal" error={errors["property.postalCode"]}>
                  <input className="form-input" value={property.postalCode} onChange={(e) => setProperty({ ...property, postalCode: e.target.value })} />
                </FormField>
              </div>

              <div style={{ marginTop: 4 }}>
                <div className="form-label" style={{ marginBottom: 8 }}>
                  Bailleur <span className="optional">(optionnel)</span>
                </div>
                <div className="radio-group" style={{ marginBottom: 10 }}>
                  {(["none", "new", "existing"] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      className={`radio-chip ${landlordMode === m ? "active" : ""}`}
                      onClick={() => setLandlordMode(m)}
                    >
                      {m === "none" ? "Aucun" : m === "new" ? "Nouveau bailleur" : "Bailleur existant"}
                    </button>
                  ))}
                </div>
                {landlordMode === "existing" && (
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
                    placeholder="Nom du bailleur…"
                  />
                )}
                {landlordMode === "new" && (
                  <div className="form-grid">
                    <FormField label="Prénom">
                      <input className="form-input" value={landlord.firstName} onChange={(e) => setLandlord({ ...landlord, firstName: e.target.value })} />
                    </FormField>
                    <FormField label="Nom">
                      <input className="form-input" value={landlord.lastName} onChange={(e) => setLandlord({ ...landlord, lastName: e.target.value })} />
                    </FormField>
                    <FormField label="Téléphone" optional>
                      <input className="form-input" value={landlord.phone} onChange={(e) => setLandlord({ ...landlord, phone: e.target.value })} />
                    </FormField>
                    <FormField label="E-mail" optional>
                      <input className="form-input" type="email" value={landlord.email} onChange={(e) => setLandlord({ ...landlord, email: e.target.value })} />
                    </FormField>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* --- Problem --- */}
        <div className="form-section">
          <div className="form-section__title">Problème</div>
          <FormField label="Description du problème" error={errors.problemDescription}>
            <textarea
              className="form-textarea"
              rows={4}
              value={problemDescription}
              onChange={(e) => setProblemDescription(e.target.value)}
              placeholder="Décrivez le problème signalé par le client…"
            />
          </FormField>
          <FormField label="Priorité">
            <div className="radio-group">
              {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => (
                <button key={p} type="button" className={`radio-chip ${priority === p ? "active" : ""}`} onClick={() => setPriority(p)}>
                  {{ LOW: "Basse", MEDIUM: "Moyenne", HIGH: "Haute", URGENT: "Urgente" }[p]}
                </button>
              ))}
            </div>
          </FormField>
        </div>

        {/* --- Initial consultation --- */}
        <div className="form-section">
          <div className="form-section__title">Consultation initiale</div>
          <label className="checkbox-row" style={{ marginBottom: 12 }}>
            <input type="checkbox" checked={scheduleNow} onChange={(e) => setScheduleNow(e.target.checked)} />
            Planifier la consultation initiale dès maintenant
          </label>
          {scheduleNow && (
            <div className="form-grid">
              <FormField label="Date" error={errors.initialVisitScheduledAt}>
                <input type="date" className="form-input" value={visitDate} onChange={(e) => setVisitDate(e.target.value)} />
              </FormField>
              <FormField label="Heure">
                <input type="time" className="form-input" value={visitTime} onChange={(e) => setVisitTime(e.target.value)} />
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
            </div>
          )}
        </div>

        <div className="form-actions">
          <button type="button" className="btn" onClick={() => navigate(-1)}>
            Annuler
          </button>
          <button type="submit" className="btn btn--primary" disabled={createCase.isPending}>
            {createCase.isPending ? "Création…" : "Créer le dossier"}
          </button>
        </div>
      </form>
    </div>
  );
}

function ModeToggle({ mode, onChange, labels }: { mode: Mode; onChange: (m: Mode) => void; labels: [string, string] }) {
  return (
    <div className="pill-toggle">
      <button type="button" className={mode === "new" ? "active" : ""} onClick={() => onChange("new")}>
        {labels[0]}
      </button>
      <button type="button" className={mode === "existing" ? "active" : ""} onClick={() => onChange("existing")}>
        {labels[1]}
      </button>
    </div>
  );
}
