import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { loginSchema } from "@msph/shared";
import { useAuth } from "../auth/AuthContext.js";
import { ApiRequestError } from "../lib/apiClient.js";

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError("Adresse e-mail ou mot de passe invalide.");
      return;
    }

    setSubmitting(true);
    try {
      await login(parsed.data);
      navigate("/", { replace: true });
    } catch (err) {
      if (err instanceof ApiRequestError && err.status === 401) {
        setError("E-mail ou mot de passe incorrect.");
      } else if (err instanceof ApiRequestError && err.status === 403) {
        setError("Ce compte a été désactivé.");
      } else if (err instanceof ApiRequestError && err.status === 429) {
        setError("Trop de tentatives. Réessayez dans quelques minutes.");
      } else {
        setError("Impossible de contacter le serveur. Vérifiez votre connexion.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-card__brand">
          <div className="sidebar-brand__mark">MS</div>
          <div>
            <h1>MSPH</h1>
          </div>
        </div>
        <p className="login-card__subtitle">Connectez-vous pour accéder à la gestion des interventions.</p>

        {error && <div className="login-banner">{error}</div>}

        <form onSubmit={handleSubmit}>
          <div className="form-field">
            <label className="form-label" htmlFor="email">
              Adresse e-mail
            </label>
            <input
              id="email"
              type="email"
              className="form-input"
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label className="form-label" htmlFor="password">
              Mot de passe
            </label>
            <input
              id="password"
              type="password"
              className="form-input"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <button type="submit" className="btn btn--primary btn--block" disabled={submitting} style={{ marginTop: 8 }}>
            {submitting ? "Connexion…" : "Se connecter"}
          </button>
        </form>
      </div>
    </div>
  );
}
