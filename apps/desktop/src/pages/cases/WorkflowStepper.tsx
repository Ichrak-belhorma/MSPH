import type { CaseWithRelations } from "@msph/shared";
import { formatRelativeDay } from "../../lib/format.js";

interface Step {
  key: string;
  label: string;
  date?: string;
  state: "done" | "current" | "pending";
}

/**
 * Derives the brief's visual workflow (Demande → Consultation →
 * Inspection → Traitement → Suivi → Résolution) from real case data —
 * visits, their inspections, treatments and the case status itself.
 * Nothing here is a separate tracked field; it's a read-only projection,
 * recomputed on every render, so it can never drift from the actual
 * records (contrast with `Case.status`, a real stored field used for
 * coarse dashboard buckets — see CONTEXT.md "Domain decisions" 3.1 for
 * why the two are deliberately different mechanisms).
 */
function computeSteps(kase: CaseWithRelations): Step[] {
  const initialVisit = kase.visits.find((v) => v.type === "INITIAL_INSPECTION");
  const inspectedVisit = kase.visits.find((v) => v.inspection !== null);
  const anyTreatmentChosen = kase.treatments.length > 0;
  const treatmentPerformed = kase.treatments.some((t) => t.status === "COMPLETED");
  const followUpVisit = kase.visits.find((v) => v.type === "FOLLOW_UP");
  const followUpDone = kase.visits.some((v) => v.type === "FOLLOW_UP" && v.status === "COMPLETED");
  const resolved = kase.status === "RESOLVED";

  function state(done: boolean, current: boolean): Step["state"] {
    if (done) return "done";
    if (current) return "current";
    return "pending";
  }

  return [
    { key: "request", label: "Demande", date: kase.createdAt, state: "done" },
    {
      key: "consultation",
      label: "Consultation",
      date: initialVisit?.scheduledAt,
      state: state(!!initialVisit, !initialVisit),
    },
    {
      key: "inspection",
      label: "Inspection",
      date: inspectedVisit?.inspection?.createdAt,
      state: state(!!inspectedVisit, !!initialVisit && !inspectedVisit),
    },
    {
      key: "treatment",
      label: "Traitement",
      date: kase.treatments.find((t) => t.status === "COMPLETED")?.performedAt ?? undefined,
      state: state(treatmentPerformed, !!inspectedVisit && !treatmentPerformed),
    },
    {
      key: "followup",
      label: "Suivi",
      date: followUpVisit?.scheduledAt,
      state: state(followUpDone, treatmentPerformed && !followUpDone),
    },
    {
      key: "resolution",
      label: "Résolution",
      date: kase.resolvedAt ?? undefined,
      state: state(resolved, followUpDone && !resolved),
    },
  ];
}

export function WorkflowStepper({ kase }: { kase: CaseWithRelations }) {
  if (kase.status === "CANCELLED") {
    return (
      <div className="state-block" style={{ padding: 20 }}>
        <span className="state-block__title" style={{ color: "var(--color-muted)" }}>
          Ce dossier a été annulé.
        </span>
      </div>
    );
  }

  const steps = computeSteps(kase);

  return (
    <div className="workflow-stepper">
      {steps.map((step) => (
        <div key={step.key} className={`workflow-step ${step.state === "done" ? "done" : step.state === "current" ? "current" : ""}`}>
          <span className="workflow-step__line" />
          <span className="workflow-step__dot">{step.state === "done" ? "✓" : ""}</span>
          <span className="workflow-step__label">{step.label}</span>
          {step.date && <span className="workflow-step__date">{formatRelativeDay(step.date)}</span>}
        </div>
      ))}
    </div>
  );
}
