import {
  CaseActivityType,
  CasePriority,
  CaseStatus,
  CaseTreatmentStatus,
  UserRole,
  VisitStatus,
  VisitType,
} from "@msph/shared";

/**
 * French UI labels for every domain enum.
 *
 * Deliberately NOT added to `packages/shared`'s `*_LABELS` constants:
 * those are consumed by the mobile app too, which is still English/
 * placeholder (see CONTEXT.md), and keeping the shared package's own
 * labels locale-neutral avoids baking a language choice into code every
 * future client has to import. The desktop app — the only one required
 * to be French this session — keeps its own translation layer here
 * instead, keyed off the same enum values so it can never drift out of
 * sync with what the API actually returns.
 */

export const CASE_STATUS_LABELS_FR: Record<CaseStatus, string> = {
  [CaseStatus.NEW]: "Nouveau",
  [CaseStatus.SCHEDULED]: "Planifié",
  [CaseStatus.IN_PROGRESS]: "En cours",
  [CaseStatus.RESOLVED]: "Résolu",
  [CaseStatus.CANCELLED]: "Annulé",
};

export const CASE_PRIORITY_LABELS_FR: Record<CasePriority, string> = {
  [CasePriority.LOW]: "Basse",
  [CasePriority.MEDIUM]: "Moyenne",
  [CasePriority.HIGH]: "Haute",
  [CasePriority.URGENT]: "Urgente",
};

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

export const USER_ROLE_LABELS_FR: Record<UserRole, string> = {
  [UserRole.ADMIN]: "Administrateur",
  [UserRole.WORKER]: "Intervenant",
};

export const CASE_ACTIVITY_TYPE_LABELS_FR: Record<CaseActivityType, string> = {
  [CaseActivityType.CASE_CREATED]: "Dossier créé",
  [CaseActivityType.STATUS_CHANGED]: "Statut modifié",
  [CaseActivityType.VISIT_SCHEDULED]: "Visite planifiée",
  [CaseActivityType.VISIT_RESCHEDULED]: "Visite reprogrammée",
  [CaseActivityType.VISIT_CANCELLED]: "Visite annulée",
  [CaseActivityType.VISIT_STARTED]: "Visite démarrée",
  [CaseActivityType.VISIT_COMPLETED]: "Visite terminée",
  [CaseActivityType.INSPECTION_RECORDED]: "Inspection enregistrée",
  [CaseActivityType.PHOTO_ADDED]: "Photo ajoutée",
  [CaseActivityType.TREATMENT_ADDED]: "Traitement ajouté",
  [CaseActivityType.TREATMENT_UPDATED]: "Traitement mis à jour",
  [CaseActivityType.TREATMENT_REMOVED]: "Traitement retiré",
  [CaseActivityType.WORKER_ASSIGNED]: "Intervenant assigné",
  [CaseActivityType.CASE_RESOLVED]: "Dossier résolu",
  [CaseActivityType.CASE_CANCELLED]: "Dossier annulé",
};
