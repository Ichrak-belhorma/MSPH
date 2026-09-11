import { useEffect } from "react";
import { createPortal } from "react-dom";
import { IconX } from "./icons.js";

interface ModalProps {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}

export function Modal({ title, onClose, wide, children }: ModalProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="overlay modal-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal ${wide ? "modal--wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal__header">
          <h2>{title}</h2>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Fermer">
            <IconX />
          </button>
        </div>
        <div className="modal__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
