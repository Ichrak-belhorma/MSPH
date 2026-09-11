import { useState } from "react";
import { createUserSchema, type User, type UserRole } from "@msph/shared";
import { useCreateUserMutation, useUpdateUserMutation, useUsersQuery } from "../../api/users.js";
import { useAuth } from "../../auth/AuthContext.js";
import { Badge } from "../../components/Badge.js";
import { Drawer } from "../../components/Drawer.js";
import { FormField } from "../../components/FormField.js";
import { EmptyState, ErrorState, LoadingState } from "../../components/States.js";
import { useToast } from "../../components/ToastProvider.js";
import { fieldErrors } from "../../lib/formErrors.js";
import { USER_ROLE_LABELS_FR } from "../../lib/labels.js";
import { IconPlus } from "../../components/icons.js";

export function WorkersPage() {
  const [roleFilter, setRoleFilter] = useState<UserRole | "">("");
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  const usersQuery = useUsersQuery({ role: roleFilter || undefined, pageSize: 100 });

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Intervenants</h1>
          <p className="page-header__subtitle">Comptes de l'équipe : intervenants terrain et administrateurs.</p>
        </div>
        <div className="page-header__actions">
          <button type="button" className="btn btn--primary" onClick={() => setCreating(true)}>
            <IconPlus /> Nouveau compte
          </button>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="pill-toggle">
          <button type="button" className={roleFilter === "" ? "active" : ""} onClick={() => setRoleFilter("")}>
            Tous
          </button>
          <button type="button" className={roleFilter === "WORKER" ? "active" : ""} onClick={() => setRoleFilter("WORKER")}>
            Intervenants
          </button>
          <button type="button" className={roleFilter === "ADMIN" ? "active" : ""} onClick={() => setRoleFilter("ADMIN")}>
            Administrateurs
          </button>
        </div>
      </div>

      {usersQuery.isLoading ? (
        <LoadingState />
      ) : usersQuery.isError ? (
        <ErrorState error={usersQuery.error} onRetry={() => void usersQuery.refetch()} />
      ) : usersQuery.data!.items.length === 0 ? (
        <EmptyState title="Aucun compte" description="Créez un compte pour un intervenant ou un administrateur." />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Nom</th>
                <th>Rôle</th>
                <th>Téléphone</th>
                <th>E-mail</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.data!.items.map((u) => (
                <tr key={u.id} onClick={() => setEditing(u)}>
                  <td className="cell-primary">
                    {u.firstName} {u.lastName}
                  </td>
                  <td>
                    <Badge tone={u.role === "ADMIN" ? "primary" : "info"}>{USER_ROLE_LABELS_FR[u.role]}</Badge>
                  </td>
                  <td>{u.phone ?? "—"}</td>
                  <td>{u.email}</td>
                  <td>
                    <Badge tone={u.active ? "success" : "neutral"}>{u.active ? "Actif" : "Désactivé"}</Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <UserFormDrawer
          user={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function UserFormDrawer({ user, onClose }: { user: User | null; onClose: () => void }) {
  const { showToast, showError } = useToast();
  const { user: currentUser } = useAuth();
  const createUser = useCreateUserMutation();
  const updateUser = useUpdateUserMutation();

  const [form, setForm] = useState({
    firstName: user?.firstName ?? "",
    lastName: user?.lastName ?? "",
    email: user?.email ?? "",
    phone: user?.phone ?? "",
    role: user?.role ?? ("WORKER" as UserRole),
    password: "",
    active: user?.active ?? true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const busy = createUser.isPending || updateUser.isPending;
  const isSelf = user?.id === currentUser?.id;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (user) {
        await updateUser.mutateAsync({
          id: user.id,
          input: { firstName: form.firstName, lastName: form.lastName, phone: form.phone || undefined, role: form.role, active: form.active },
        });
        showToast("Compte mis à jour.", "success");
      } else {
        const payload = {
          firstName: form.firstName,
          lastName: form.lastName,
          email: form.email,
          phone: form.phone || undefined,
          password: form.password,
          role: form.role,
        };
        const parsed = createUserSchema.safeParse(payload);
        if (!parsed.success) {
          setErrors(fieldErrors(parsed.error));
          return;
        }
        await createUser.mutateAsync(parsed.data);
        showToast("Compte créé.", "success");
      }
      onClose();
    } catch (err) {
      showError(err, "Impossible d'enregistrer le compte.");
    }
  }

  return (
    <Drawer title={user ? "Modifier le compte" : "Nouveau compte"} onClose={onClose}>
      <form onSubmit={handleSubmit}>
        <FormField label="Prénom" error={errors.firstName}>
          <input className="form-input" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} />
        </FormField>
        <FormField label="Nom" error={errors.lastName}>
          <input className="form-input" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} />
        </FormField>
        <FormField label="E-mail" error={errors.email}>
          <input type="email" className="form-input" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} disabled={!!user} />
        </FormField>
        <FormField label="Téléphone" optional>
          <input className="form-input" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </FormField>
        {!user && (
          <FormField label="Mot de passe temporaire" error={errors.password} hint="8 caractères minimum, majuscule, minuscule et chiffre.">
            <input type="password" className="form-input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          </FormField>
        )}
        <FormField label="Rôle">
          <select
            className="form-select"
            value={form.role}
            disabled={isSelf}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
          >
            <option value="WORKER">Intervenant</option>
            <option value="ADMIN">Administrateur</option>
          </select>
        </FormField>
        {user && (
          <label className="checkbox-row" style={{ marginBottom: 16 }}>
            <input type="checkbox" checked={form.active} disabled={isSelf} onChange={(e) => setForm({ ...form, active: e.target.checked })} />
            Compte actif
          </label>
        )}
        {isSelf && <p className="form-hint" style={{ marginBottom: 16 }}>Vous ne pouvez pas modifier votre propre rôle ou désactiver votre compte.</p>}
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
