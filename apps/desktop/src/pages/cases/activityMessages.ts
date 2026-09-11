import type { CaseActivity, CaseStatus, CaseWithRelations } from "@msph/shared";
import { formatDateTime } from "../../lib/format.js";
import { CASE_STATUS_LABELS_FR, VISIT_TYPE_LABELS_FR } from "../../lib/labels.js";

/**
 * `CaseActivity.message` is generated server-side in English (see
 * apps/server/src/modules/cases/case-activity.ts and its call sites) —
 * deliberately: the backend is locale-neutral so it isn't coupled to one
 * client's language (see CONTEXT.md, `labels.ts`'s doc comment for the
 * same reasoning applied to enum labels). Since this app must be fully
 * French, the activity feed reconstructs a French sentence from the
 * event's `type` + `metadata` + the case's own already-loaded data
 * (visits, treatments) instead of displaying that raw message — real
 * data, not a translation guess. The one exception is a treatment's
 * name, which isn't in `metadata`; it's extracted from the message's
 * consistently-quoted `"Name"` substring (every TREATMENT_* message is
 * written that way server-side) rather than re-fetched, and falls back
 * to generic wording if the format ever changes.
 */
function extractQuotedName(message: string): string | null {
  return message.match(/"([^"]+)"/)?.[1] ?? null;
}

function statusLabel(value: unknown): string {
  return typeof value === "string" && value in CASE_STATUS_LABELS_FR ? CASE_STATUS_LABELS_FR[value as CaseStatus] : String(value ?? "");
}

export function translateActivity(activity: CaseActivity, kase: CaseWithRelations): string {
  const meta = (activity.metadata ?? {}) as Record<string, unknown>;
  const visit = typeof meta.visitId === "string" ? kase.visits.find((v) => v.id === meta.visitId) : undefined;
  const visitLabel = visit ? VISIT_TYPE_LABELS_FR[visit.type] : "Visite";
  const visitDate = visit ? formatDateTime(visit.scheduledAt) : "";

  switch (activity.type) {
    case "CASE_CREATED":
      return "Dossier créé.";
    case "STATUS_CHANGED":
    case "CASE_RESOLVED":
    case "CASE_CANCELLED":
      return `Statut passé de « ${statusLabel(meta.from)} » à « ${statusLabel(meta.to)} ».`;
    // "Visite" (fem.) is kept as the grammatical subject throughout —
    // visitLabel ("Traitement", "Suivi", ...) varies in gender, so it's
    // quoted as an apposition rather than driving agreement itself
    // (avoids e.g. the wrong "Suivi planifiée").
    case "VISIT_SCHEDULED":
      return visit ? `Visite « ${visitLabel} » planifiée pour le ${visitDate}.` : "Visite planifiée.";
    case "VISIT_RESCHEDULED":
      return visit ? `Visite « ${visitLabel} » reprogrammée au ${visitDate}.` : "Visite reprogrammée.";
    case "VISIT_CANCELLED":
      return "Visite annulée.";
    case "VISIT_STARTED":
      return `Visite « ${visitLabel} » démarrée.`;
    case "VISIT_COMPLETED":
      return `Visite « ${visitLabel} » terminée.`;
    case "INSPECTION_RECORDED":
      return "Détails de l'inspection enregistrés.";
    case "PHOTO_ADDED":
      return visit ? `Photo ajoutée à la visite du ${visitDate}.` : "Photo ajoutée.";
    case "WORKER_ASSIGNED":
      return visit?.assignedWorker
        ? `${visit.assignedWorker.firstName} ${visit.assignedWorker.lastName} assigné(e) à la visite.`
        : "Intervenant assigné à la visite.";
    case "TREATMENT_ADDED": {
      const name = extractQuotedName(activity.message);
      return name ? `Traitement « ${name} » ajouté au dossier.` : "Traitement ajouté au dossier.";
    }
    case "TREATMENT_UPDATED": {
      const name = extractQuotedName(activity.message);
      const performed = meta.status === "COMPLETED";
      if (!name) return "Traitement mis à jour.";
      return performed ? `Traitement « ${name} » marqué comme effectué.` : `Traitement « ${name} » mis à jour.`;
    }
    case "TREATMENT_REMOVED": {
      const name = extractQuotedName(activity.message);
      return name ? `Traitement « ${name} » retiré du dossier.` : "Traitement retiré du dossier.";
    }
    default:
      return activity.message;
  }
}
