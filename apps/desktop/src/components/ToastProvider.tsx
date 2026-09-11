import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ApiRequestError } from "../lib/apiClient.js";

interface Toast {
  id: number;
  message: string;
  tone: "default" | "success" | "error";
}

interface ToastContextValue {
  showToast: (message: string, tone?: Toast["tone"]) => void;
  showError: (error: unknown, fallback?: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Lightweight global feedback for mutations — "Dossier créé", or an API
 * error message the user needs to see but that doesn't warrant a full
 * error screen. Not used for form-field validation, which renders inline
 * under the field instead. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);

  const showToast = useCallback((message: string, tone: Toast["tone"] = "default") => {
    const id = nextId.current++;
    setToasts((prev) => [...prev, { id, message, tone }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  const showError = useCallback(
    (error: unknown, fallback = "Une erreur est survenue.") => {
      const message = error instanceof ApiRequestError ? error.message : fallback;
      showToast(message, "error");
    },
    [showToast],
  );

  return (
    <ToastContext.Provider value={{ showToast, showError }}>
      {children}
      {createPortal(
        <div className="toast-region">
          {toasts.map((t) => (
            <div key={t.id} className={`toast ${t.tone === "error" ? "toast--error" : t.tone === "success" ? "toast--success" : ""}`}>
              {t.message}
            </div>
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
