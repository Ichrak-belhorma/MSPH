import { Modal } from "./Modal.js";

interface ConfirmDialogProps {
  title: string;
  message: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Used for consequential actions the manager shouldn't trigger by
 * accident — marking a case resolved, cancelling a visit, removing a
 * treatment. Not every mutation needs this, just the ones that are
 * awkward to walk back. */
export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Confirmer",
  cancelLabel = "Annuler",
  danger,
  busy,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  return (
    <Modal title={title} onClose={onCancel}>
      <p style={{ fontSize: 13.5, lineHeight: 1.6 }}>{message}</p>
      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          {cancelLabel}
        </button>
        <button
          type="button"
          className={danger ? "btn btn--danger-solid" : "btn btn--primary"}
          onClick={onConfirm}
          disabled={busy}
        >
          {busy ? "…" : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
