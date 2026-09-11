import { useEffect, useRef, useState } from "react";
import { IconCheck, IconX } from "./icons.js";

interface SearchSelectProps<T> {
  items: T[];
  loading: boolean;
  search: string;
  onSearchChange: (value: string) => void;
  selected: T | null;
  onSelect: (item: T | null) => void;
  getId: (item: T) => string;
  getLabel: (item: T) => string;
  getSubLabel?: (item: T) => string;
  placeholder?: string;
}

/** Search-as-you-type picker against a real list endpoint (customers,
 * properties, landlords, treatments, workers) — used everywhere a form
 * needs to reference an *existing* record. Not a full combobox
 * accessibility implementation, but sufficient for a mouse-driven desktop
 * tool. */
export function SearchSelect<T>({
  items,
  loading,
  search,
  onSearchChange,
  selected,
  onSelect,
  getId,
  getLabel,
  getSubLabel,
  placeholder,
}: SearchSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (selected) {
    return (
      <div className="flex-row">
        <div className="form-input" style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span className="flex-row">
            <IconCheck style={{ width: 14, height: 14, color: "var(--color-primary)" }} />
            {getLabel(selected)}
          </span>
        </div>
        <button type="button" className="btn btn--icon btn--sm" onClick={() => onSelect(null)} title="Changer">
          <IconX style={{ width: 13, height: 13 }} />
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={{ position: "relative" }}>
      <input
        className="form-input"
        placeholder={placeholder}
        value={search}
        onFocus={() => setOpen(true)}
        onChange={(e) => {
          onSearchChange(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <div
          className="card"
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 20,
            maxHeight: 220,
            overflowY: "auto",
            boxShadow: "var(--shadow-md)",
          }}
        >
          {loading ? (
            <div className="card__body muted" style={{ fontSize: 12.5 }}>
              Recherche…
            </div>
          ) : items.length === 0 ? (
            <div className="card__body muted" style={{ fontSize: 12.5 }}>
              Aucun résultat.
            </div>
          ) : (
            items.map((item) => (
              <button
                key={getId(item)}
                type="button"
                className="btn--ghost"
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "8px 12px",
                  border: "none",
                  background: "none",
                  borderBottom: "1px solid var(--color-border)",
                  cursor: "pointer",
                }}
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                }}
              >
                <div style={{ fontSize: 13, fontWeight: 500 }}>{getLabel(item)}</div>
                {getSubLabel && <div style={{ fontSize: 11.5, color: "var(--color-muted)" }}>{getSubLabel(item)}</div>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
