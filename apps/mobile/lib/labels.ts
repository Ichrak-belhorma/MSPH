import {
  CaseTreatmentStatus,
  CasePriority,
  VisitStatus,
  VisitType,
} from "@msph/shared";

/**
 * French UI labels for the domain enums the mobile app actually shows a
 * worker. Duplicated from `apps/desktop/src/lib/labels.ts` rather than
 * hoisted into `packages/shared` — see that file's doc comment for the
 * original reasoning (keep the backend/shared package locale-neutral).
 * That reasoning assumed mobile might stay English; as of this session
 * both real clients are French, so hoisting a shared `labels-fr.ts` would
 * now be a reasonable follow-up (see CONTEXT.md "Next steps") — not done
 * here to avoid touching the already-verified desktop app in a session
 * about mobile. Kept intentionally in sync by hand: same enum values as
 * keys, so a mismatch would be a TypeScript error, not a silent drift.
 */

export const VISIT_TYPE_LABELS_FR: Record<VisitType, string> = {
  [VisitType.INITIAL_INSPECTION]: "Inspection initiale",
  [VisitType.TREATMENT]: "Traitement",
  [VisitType.FOLLOW_UP]: "Suivi",
  [VisitType.OTHER]: "Autre",
};

export const VISIT_STATUS_LABELS_FR: Record<VisitStatus, string> = {
  [VisitStatus.SCHEDULED]: "Planifiée",
  [VisitStatus.IN_PROGRESS]: "En cours",
  [VisitStatus.COMPLETED]: "Terminée",
  [VisitStatus.CANCELLED]: "Annulée",
  [VisitStatus.NO_SHOW]: "Absence",
};

export const CASE_TREATMENT_STATUS_LABELS_FR: Record<CaseTreatmentStatus, string> = {
  [CaseTreatmentStatus.PLANNED]: "Planifié",
  [CaseTreatmentStatus.COMPLETED]: "Effectué",
  [CaseTreatmentStatus.CANCELLED]: "Annulé",
};

export const CASE_PRIORITY_LABELS_FR: Record<CasePriority, string> = {
  [CasePriority.LOW]: "Basse",
  [CasePriority.MEDIUM]: "Moyenne",
  [CasePriority.HIGH]: "Haute",
  [CasePriority.URGENT]: "Urgente",
};
