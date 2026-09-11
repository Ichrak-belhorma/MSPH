import { useEffect, useState } from "react";
import { createCustomerSchema, type Customer } from "@msph/shared";
import { useCreateCustomerMutation, useCustomersQuery, useUpdateCustomerMutation } from "../../api/customers.js";
import { Drawer } from "../../components/Drawer.js";
import { FormField } from "../../components/FormField.js";
import { EmptyState, ErrorState, LoadingState } from "../../components/States.js";
import { useToast } from "../../components/ToastProvider.js";
import { IconPlus, IconSearch } from "../../components/icons.js";
import { fieldErrors } from "../../lib/formErrors.js";


export function CustomersPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [editing, setEditing] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const customersQuery = useCustomersQuery({ search: debounced || undefined, pageSize: 50 });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Clients</h1>
          <p className="page-header__subtitle">{customersQuery.data ? `${customersQuery.data.total} client(s)` : " "}</p>
        </div>
        <div className="page-header__actions">
          <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
            <IconPlus /> Nouveau client
          </button>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="search-input-wrap">
          <IconSearch className="icon" />
          <input className="form-input" placeholder="Rechercher…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      {customersQuery.isLoading ? (
        <LoadingState />
      ) : customersQuery.isError ? (
        <ErrorState error={customersQuery.error} onRetry={() => void customersQuery.refetch()} />
      ) : customersQuery.data!.items.length === 0 ? (
        <EmptyState title="Aucun client" description="Les clients apparaissent ici une fois créés (directement, ou via un nouveau dossier)." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Téléphone</th>
                <th>E-mail</th>
              </tr>
            </thead>
            <tbody>
              {customersQuery.data!.items.map((c) => (
                <tr key={c.id} onClick={() => setEditing(c)}>
                  <td className="cell-primary">
                    {c.firstName} {c.lastName}
                  </td>
                  <td>{c.phone}</td>
                  <td>{c.email ?? <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <CustomerFormDrawer
          customer={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function CustomerFormDrawer({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { showToast, showError } = useToast();
  const createCustomer = useCreateCustomerMutation();
  const updateCustomer = useUpdateCustomerMutation();
  const [form, setForm] = useState({
    firstName: customer?.firstName ?? "",
    lastName: customer?.lastName ?? "",
    phone: customer?.phone ?? "",
    email: customer?.email ?? "",
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { ...form, email: form.email || undefined };
    const parsed = createCustomerSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    try {
      if (customer) {
        await updateCustomer.mutateAsync({ id: customer.id, input: parsed.data });
        showToast("Client mis à jour.", "success");
      } else {
        await createCustomer.mutateAsync(parsed.data);
        showToast("Client créé.", "success");
      }
      onClose();
    } catch (err) {
      showError(err, "Impossible d'enregistrer le client.");
    }
  }

  const busy = createCustomer.isPending || updateCustomer.isPending;

  return (
    <Drawer title={customer ? "Modifier le client" : "Nouveau client"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Prénom" error={errors.firstName}>
          <input className="form-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </FormField>
        <FormField label="Nom" error={errors.lastName}>
          <input className="form-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </FormField>
        <FormField label="Téléphone" error={errors.phone}>
          <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </FormField>
        <FormField label="E-mail" optional error={errors.email}>
          <input type="email" className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </FormField>
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
