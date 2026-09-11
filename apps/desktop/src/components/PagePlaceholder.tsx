interface PagePlaceholderProps {
  title: string;
  description: string;
}

/** Used by every screen that isn't built yet. Swap for the real screen as
 * each module lands (see CONTEXT.md "Next steps"). */
export function PagePlaceholder({ title, description }: PagePlaceholderProps) {
  return (
    <div className="page">
      <h1>{title}</h1>
      <p className="muted">{description}</p>
      <div className="placeholder-box">Not built yet</div>
    </div>
  );
}
