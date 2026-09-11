interface FormFieldProps {
  label: string;
  htmlFor?: string;
  error?: string;
  optional?: boolean;
  hint?: string;
  span2?: boolean;
  children: React.ReactNode;
}

export function FormField({ label, htmlFor, error, optional, hint, span2, children }: FormFieldProps) {
  return (
    <div className={`form-field ${span2 ? "form-field--span2" : ""}`}>
      <label className="form-label" htmlFor={htmlFor}>
        {label}
        {optional && <span className="optional">(optionnel)</span>}
      </label>
      {children}
      {hint && !error && <span className="form-hint">{hint}</span>}
      {error && <span className="form-error">{error}</span>}
    </div>
  );
}
