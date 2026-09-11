import { useState } from "react";
import { changePasswordSchema } from "@msph/shared";
import { useChangePasswordMutation } from "../../api/auth.js";
import { useAuth } from "../../auth/AuthContext.js";
import { FormField } from "../../components/FormField.js";
import { useToast } from "../../components/ToastProvider.js";
import { fieldErrors } from "../../lib/formErrors.js";
import { USER_ROLE_LABELS_FR } from "../../lib/labels.js";
import { initials } from "../../lib/format.js";

export function SettingsPage() {
  const { user, logout } = useAuth();
  const { showToast, showError } = useToast();
  const changePassword = useChangePasswordMutation();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  if (!user) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setErrors({ confirmPassword: "Les mots de passe ne correspondent pas." });
      return;
    }
    const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword });
    if (!parsed.success) {
      setErrors(fieldErrors(parsed.error));
      return;
    }
    try {
      await changePassword.mutateAsync(parsed.data);
      showToast("Mot de passe mis à jour. Vos autres sessions ont été déconnectées.", "success");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
      setErrors({});
    } catch (err) {
      showError(err, "Impossible de mettre à jour le mot de passe.");
    }
  }

  return (
    <div className="page">
      <div className="page-header">
        <div>
          <h1>Paramètres</h1>
          <p className="page-header__subtitle">Votre compte et vos préférences.</p>
        </div>
      </div>

      <div style={{ maxWidth: 480, display: "flex", flexDirection: "column", gap: 16 }}>
        <div className="card">
          <div className="card__header">
            <h2>Compte</h2>
          </div>
          <div className="card__body">
            <div className="person-inline" style={{ marginBottom: 16 }}>
              <span className="avatar avatar--lg">{initials(user)}</span>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {user.firstName} {user.lastName}
                </div>
                <div className="muted" style={{ fontSize: 12.5 }}>
                  {USER_ROLE_LABELS_FR[user.role]}
                </div>
              </div>
            </div>
            <div className="info-row">
              <span className="info-row__label">E-mail</span>
              <span className="info-row__value">{user.email}</span>
            </div>
            {user.phone && (
              <div className="info-row">
                <span className="info-row__label">Téléphone</span>
                <span className="info-row__value">{user.phone}</span>
              </div>
            )}
            <button type="button" className="btn btn--danger" style={{ marginTop: 16 }} onClick={() => void logout()}>
              Se déconnecter
            </button>
          </div>
        </div>

        <div className="card">
          <div className="card__header">
            <h2>Changer le mot de passe</h2>
          </div>
          <div className="card__body">
            <form onSubmit={handleSubmit}>
              <FormField label="Mot de passe actuel" error={errors.currentPassword}>
                <input type="password" className="form-input" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
              </FormField>
              <FormField label="Nouveau mot de passe" error={errors.newPassword} hint="8 caractères minimum, majuscule, minuscule et chiffre.">
                <input type="password" className="form-input" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
              </FormField>
              <FormField label="Confirmer le nouveau mot de passe" error={errors.confirmPassword}>
                <input type="password" className="form-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
              </FormField>
              <button type="submit" className="btn btn--primary" disabled={changePassword.isPending}>
                {changePassword.isPending ? "Mise à jour…" : "Mettre à jour le mot de passe"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
