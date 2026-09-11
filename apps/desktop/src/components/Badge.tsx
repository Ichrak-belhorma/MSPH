import type { CasePriority, CaseStatus, CaseTreatmentStatus, VisitStatus } from "@msph/shared";
import {
  CASE_PRIORITY_LABELS_FR,
  CASE_STATUS_LABELS_FR,
  CASE_TREATMENT_STATUS_LABELS_FR,
  VISIT_STATUS_LABELS_FR,
} from "../lib/labels.js";

type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "primary";

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`badge badge--${tone}`}>{children}</span>;
}

const CASE_STATUS_TONE: Record<CaseStatus, Tone> = {
  NEW: "info",
  SCHEDULED: "warning",
  IN_PROGRESS: "primary",
  RESOLVED: "success",
  CANCELLED: "neutral",
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  return <Badge tone={CASE_STATUS_TONE[status]}>{CASE_STATUS_LABELS_FR[status]}</Badge>;
}

const PRIORITY_TONE: Record<CasePriority, Tone> = {
  LOW: "neutral",
  MEDIUM: "info",
  HIGH: "warning",
  URGENT: "danger",
};

export function PriorityBadge({ priority }: { priority: CasePriority }) {
  return <Badge tone={PRIORITY_TONE[priority]}>{CASE_PRIORITY_LABELS_FR[priority]}</Badge>;
}

const VISIT_STATUS_TONE: Record<VisitStatus, Tone> = {
  SCHEDULED: "warning",
  IN_PROGRESS: "primary",
  COMPLETED: "success",
  CANCELLED: "neutral",
  NO_SHOW: "danger",
};

export function VisitStatusBadge({ status }: { status: VisitStatus }) {
  return <Badge tone={VISIT_STATUS_TONE[status]}>{VISIT_STATUS_LABELS_FR[status]}</Badge>;
}

const CASE_TREATMENT_STATUS_TONE: Record<CaseTreatmentStatus, Tone> = {
  PLANNED: "warning",
  COMPLETED: "success",
  CANCELLED: "neutral",
};

export function CaseTreatmentStatusBadge({ status }: { status: CaseTreatmentStatus }) {
  return <Badge tone={CASE_TREATMENT_STATUS_TONE[status]}>{CASE_TREATMENT_STATUS_LABELS_FR[status]}</Badge>;
}
