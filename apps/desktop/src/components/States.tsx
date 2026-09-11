import { ApiRequestError } from "../lib/apiClient.js";
import { IconAlertTriangle, IconRefresh } from "./icons.js";

export function LoadingState({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="state-block">
      <div className="spinner" />
      <span className="state-block__title">{label}</span>
    </div>
  );
}

export function InlineLoading({ label = "Chargement…" }: { label?: string }) {
  return (
    <span className="inline-spinner muted">
      <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
      {label}
    </span>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiRequestError ? error.message : "Une erreur est survenue.";
  return (
    <div className="state-block state-block--error">
      <IconAlertTriangle style={{ width: 22, height: 22 }} />
      <span className="state-block__title">Impossible de charger les données</span>
      <span>{message}</span>
      {onRetry && (
        <button type="button" className="btn btn--sm" style={{ marginTop: 8 }} onClick={onRetry}>
          <IconRefresh /> Réessayer
        </button>
      )}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="state-block">
      <span className="state-block__title">{title}</span>
      {description && <span>{description}</span>}
      {action}
    </div>
  );
}
