import { useEffect } from "react";
import { createPortal } from "react-dom";
import { IconX } from "./icons.js";

interface DrawerProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Slide-in side panel for quick create/edit forms (customer, property,
 * treatment, worker) — see CaseNewPage for why the bigger "New Case"
 * workflow gets a dedicated full page instead. */
export function Drawer({ title, onClose, children }: DrawerProps) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return createPortal(
    <div className="overlay drawer-overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div className="drawer__header">
          <h2>{title}</h2>
          <button type="button" className="close-btn" onClick={onClose} aria-label="Fermer">
            <IconX />
          </button>
        </div>
        <div className="drawer__body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
