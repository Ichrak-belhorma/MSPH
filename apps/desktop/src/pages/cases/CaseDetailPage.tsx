import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import type { CaseStatus, VisitType } from "@msph/shared";
import { useCaseQuery, useRemoveCaseTreatmentMutation, useUpdateCaseMutation, useUpdateCaseTreatmentMutation, type CaseVisit } from "../../api/cases.js";
import { useStartVisitMutation } from "../../api/visits.js";
import { useCaseRoom } from "../../realtime/useCaseRoom.js";
import { CaseStatusBadge, CaseTreatmentStatusBadge, PriorityBadge, VisitStatusBadge } from "../../components/Badge.js";
import { ErrorState, LoadingState } from "../../components/States.js";
import { ConfirmDialog } from "../../components/ConfirmDialog.js";
import { useToast } from "../../components/ToastProvider.js";
import { formatDateTime, formatRelativeDay, formatTimeAgo, fullName } from "../../lib/format.js";
import { CASE_ACTIVITY_TYPE_LABELS_FR, VISIT_TYPE_LABELS_FR } from "../../lib/labels.js";
import { IconEdit, IconImage, IconPlus, IconTrash } from "../../components/icons.js";
import { WorkflowStepper } from "./WorkflowStepper.js";
import { ScheduleVisitModal } from "./ScheduleVisitModal.js";
import { EditVisitModal } from "./EditVisitModal.js";
import { CompleteVisitModal } from "./CompleteVisitModal.js";
import { AddPhotoModal } from "./AddPhotoModal.js";
import { TreatmentPickerModal } from "./TreatmentPickerModal.js";
import { translateActivity } from "./activityMessages.js";

type ModalState =
  | { kind: "none" }
  | { kind: "schedule"; defaultType?: VisitType }
  | { kind: "edit-visit"; visit: CaseVisit }
  | { kind: "complete-visit"; visit: CaseVisit }
  | { kind: "add-photo"; visitId: string }
  | { kind: "pick-treatment" }
  | { kind: "confirm-status"; status: CaseStatus };

const CONFIRM_COPY: Record<CaseStatus, { title: string; message: string; danger?: boolean }> = {
  RESOLVED: { title: "Marquer le dossier comme résolu ?", message: "Le problème est confirmé résolu. Cette action peut être annulée plus tard en réouvrant le dossier." },
  CANCELLED: { title: "Annuler ce dossier ?", message: "Le dossier sera marqué comme annulé.", danger: true },
  NEW: { title: "Réouvrir ce dossier ?", message: "Le dossier redeviendra actif." },
  SCHEDULED: { title: "Réouvrir ce dossier ?", message: "Le dossier redeviendra actif." },
  IN_PROGRESS: { title: "Réouvrir ce dossier ?", message: "Le dossier redeviendra actif et repassera en cours." },
};

export function CaseDetailPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const navigate = useNavigate();
  const { showToast, showError } = useToast();
  const caseQuery = useCaseQuery(caseId);
  const updateCase = useUpdateCaseMutation(caseId ?? "");
  const startVisit = useStartVisitMutation(caseId);
  const updateCaseTreatment = useUpdateCaseTreatmentMutation(caseId ?? "");
  const removeCaseTreatment = useRemoveCaseTreatmentMutation(caseId ?? "");

  useCaseRoom(caseId);

  const [modal, setModal] = useState<ModalState>({ kind: "none" });
  const closeModal = () => setModal({ kind: "none" });

  if (caseQuery.isLoading) return <LoadingState label="Chargement du dossier…" />;
  if (caseQuery.isError || !caseQuery.data) return <ErrorState error={caseQuery.error} onRetry={() => void caseQuery.refetch()} />;

  const kase = caseQuery.data;
  const isTerminal = kase.status === "RESOLVED" || kase.status === "CANCELLED";
  const upcomingVisit = kase.visits.find((v) => v.status === "SCHEDULED" || v.status === "IN_PROGRESS");
  const assignedWorker = upcomingVisit?.assignedWorker ?? [...kase.visits].reverse().find((v) => v.assignedWorker)?.assignedWorker;

  async function handleStatusConfirm(status: CaseStatus) {
    try {
      await updateCase.mutateAsync({ status });
      showToast(status === "RESOLVED" ? "Dossier marqué comme résolu." : status === "CANCELLED" ? "Dossier annulé." : "Dossier réouvert.", "success");
      closeModal();
    } catch (err) {
      showError(err, "Impossible de mettre à jour le statut.");
    }
  }

  async function handleStartVisit(visit: CaseVisit) {
    try {
      await startVisit.mutateAsync({ id: visit.id });
      showToast("Visite démarrée.", "success");
    } catch (err) {
      showError(err, "Impossible de démarrer la visite.");
    }
  }

  async function handleMarkTreatmentPerformed(caseTreatmentId: string) {
    try {
      await updateCaseTreatment.mutateAsync({ caseTreatmentId, input: { status: "COMPLETED" } });
      showToast("Traitement marqué comme effectué.", "success");
    } catch (err) {
      showError(err, "Impossible de mettre à jour le traitement.");
    }
  }

  async function handleRemoveTreatment(caseTreatmentId: string) {
    try {
      await removeCaseTreatment.mutateAsync(caseTreatmentId);
      showToast("Traitement retiré.", "success");
    } catch (err) {
      showError(err, "Impossible de retirer le traitement.");
    }
  }

  return (
    <div className="page">
      <button type="button" className="btn btn--ghost btn--sm" onClick={() => navigate("/dossiers")} style={{ marginBottom: 12 }}>
        ← Retour aux dossiers
      </button>

      {/* Header */}
      <div className="case-header">
        <div className="case-header__top">
          <div className="case-header__badges">
            <CaseStatusBadge status={kase.status} />
            <PriorityBadge priority={kase.priority} />
          </div>
          <div className="case-header__actions">
            {!isTerminal && (
              <>
                <button type="button" className="btn btn--primary" onClick={() => setModal({ kind: "schedule" })}>
                  <IconPlus /> Planifier une visite
                </button>
                <button type="button" className="btn" onClick={() => setModal({ kind: "pick-treatment" })}>
                  Choisir un traitement
                </button>
                <button type="button" className="btn" onClick={() => setModal({ kind: "confirm-status", status: "RESOLVED" })}>
                  Marquer résolu
                </button>
                <button type="button" className="btn btn--danger" onClick={() => setModal({ kind: "confirm-status", status: "CANCELLED" })}>
                  Annuler
                </button>
              </>
            )}
            {isTerminal && (
              <button type="button" className="btn btn--primary" onClick={() => setModal({ kind: "confirm-status", status: "IN_PROGRESS" })}>
                Réouvrir le dossier
              </button>
            )}
          </div>
        </div>

        <h1 className="case-header__title">{fullName(kase.customer)}</h1>

        <div className="case-header__meta">
          <div className="meta-item">
            <span className="meta-item__label">Propriété</span>
            <span className="meta-item__value">{kase.property.address}, {kase.property.city}</span>
          </div>
          <div className="meta-item">
            <span className="meta-item__label">Intervenant</span>
            <span className="meta-item__value">{assignedWorker ? fullName(assignedWorker) : "Non assigné"}</span>
          </div>
          <div className="meta-item">
            <span className="meta-item__label">Prochaine visite</span>
            <span className="meta-item__value">{upcomingVisit ? formatRelativeDay(upcomingVisit.scheduledAt) : "Aucune"}</span>
          </div>
          <div className="meta-item">
            <span className="meta-item__label">Créé le</span>
            <span className="meta-item__value">{formatDateTime(kase.createdAt)}</span>
          </div>
        </div>
      </div>

      {/* Visual workflow */}
      <div className="card" style={{ marginBottom: 16 }}>
        <WorkflowStepper kase={kase} />
      </div>

      <div className="case-detail-grid">
        <div className="case-main">
          {/* Visits + inspections */}
          <div className="card">
            <div className="card__header">
              <h2>Visites et inspections</h2>
              {!isTerminal && (
                <button type="button" className="btn btn--sm" onClick={() => setModal({ kind: "schedule" })}>
                  <IconPlus /> Planifier
                </button>
              )}
            </div>
            <div className="card__body">
              {kase.visits.length === 0 ? (
                <p className="muted">Aucune visite planifiée pour l'instant.</p>
              ) : (
                [...kase.visits].reverse().map((visit) => (
                  <VisitCard
                    key={visit.id}
                    visit={visit}
                    onStart={() => void handleStartVisit(visit)}
                    onComplete={() => setModal({ kind: "complete-visit", visit })}
                    onEdit={() => setModal({ kind: "edit-visit", visit })}
                    onAddPhoto={() => setModal({ kind: "add-photo", visitId: visit.id })}
                  />
                ))
              )}
            </div>
          </div>

          {/* Treatments */}
          <div className="card">
            <div className="card__header">
              <h2>Traitements</h2>
              {!isTerminal && (
                <button type="button" className="btn btn--sm" onClick={() => setModal({ kind: "pick-treatment" })}>
                  <IconPlus /> Ajouter
                </button>
              )}
            </div>
            <div className="card__body">
              {kase.treatments.length === 0 ? (
                <p className="muted">Aucun traitement sélectionné.</p>
              ) : (
                kase.treatments.map((ct) => (
                  <div className="treatment-row" key={ct.id}>
                    <div>
                      <div className="treatment-row__name">{ct.treatment.name}</div>
                      {ct.notes && <div className="treatment-row__notes">{ct.notes}</div>}
                      {ct.performedAt && <div className="treatment-row__notes">Effectué le {formatDateTime(ct.performedAt)}</div>}
                    </div>
                    <div className="treatment-row__actions">
                      <CaseTreatmentStatusBadge status={ct.status} />
                      {ct.status === "PLANNED" && !isTerminal && (
                        <button type="button" className="btn btn--sm" onClick={() => void handleMarkTreatmentPerformed(ct.id)}>
                          Marquer effectué
                        </button>
                      )}
                      {!isTerminal && (
                        <button
                          type="button"
                          className="btn btn--icon btn--sm"
                          title="Retirer"
                          onClick={() => void handleRemoveTreatment(ct.id)}
                        >
                          <IconTrash style={{ width: 13, height: 13 }} />
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Photos */}
          <div className="card">
            <div className="card__header">
              <h2>Photos</h2>
            </div>
            <div className="card__body">
              {kase.photos.length === 0 ? (
                <p className="muted">Aucune photo pour l'instant.</p>
              ) : (
                <div className="photo-grid">
                  {kase.photos.map((photo) => (
                    <div className="photo-tile" key={photo.id}>
                      <div className="photo-tile__icon">
                        <IconImage />
                      </div>
                      <div className="photo-tile__caption">{photo.caption ?? photo.storageKey}</div>
                      <div className="photo-tile__meta">{formatDateTime(photo.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Timeline */}
          <div className="card">
            <div className="card__header">
              <h2>Historique</h2>
            </div>
            <div className="card__body">
              <div className="activity-list">
                {[...kase.activities].reverse().map((activity) => (
                  <div className="activity-item" key={activity.id}>
                    <span className="activity-item__dot" />
                    <div className="activity-item__body">
                      <div className="activity-item__message">{translateActivity(activity, kase)}</div>
                      <div className="activity-item__meta">
                        {CASE_ACTIVITY_TYPE_LABELS_FR[activity.type]} · {formatTimeAgo(activity.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="case-side">
          <div className="card">
            <div className="card__header">
              <h2>Client</h2>
            </div>
            <div className="card__body">
              <div className="info-row">
                <span className="info-row__label">Nom</span>
                <span className="info-row__value">{fullName(kase.customer)}</span>
              </div>
              <div className="info-row">
                <span className="info-row__label">Téléphone</span>
                <span className="info-row__value">{kase.customer.phone}</span>
              </div>
              {kase.customer.email && (
                <div className="info-row">
                  <span className="info-row__label">E-mail</span>
                  <span className="info-row__value">{kase.customer.email}</span>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card__header">
              <h2>Propriété</h2>
            </div>
            <div className="card__body">
              <div className="info-row">
                <span className="info-row__label">Adresse</span>
                <span className="info-row__value">{kase.property.address}</span>
              </div>
              <div className="info-row">
                <span className="info-row__label">Ville</span>
                <span className="info-row__value">{kase.property.city}</span>
              </div>
              <div className="info-row">
                <span className="info-row__label">Code postal</span>
                <span className="info-row__value">{kase.property.postalCode}</span>
              </div>
            </div>
          </div>

          <div className="card">
            <div className="card__header">
              <h2>Bailleur</h2>
            </div>
            <div className="card__body">
              {kase.property.landlord ? (
                <>
                  <div className="info-row">
                    <span className="info-row__label">Nom</span>
                    <span className="info-row__value">{fullName(kase.property.landlord)}</span>
                  </div>
                  {kase.property.landlord.phone && (
                    <div className="info-row">
                      <span className="info-row__label">Téléphone</span>
                      <span className="info-row__value">{kase.property.landlord.phone}</span>
                    </div>
                  )}
                  {kase.property.landlord.email && (
                    <div className="info-row">
                      <span className="info-row__label">E-mail</span>
                      <span className="info-row__value">{kase.property.landlord.email}</span>
                    </div>
                  )}
                </>
              ) : (
                <p className="muted">Aucun bailleur renseigné.</p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card__header">
              <h2>Problème</h2>
            </div>
            <div className="card__body">
              <p className="problem-text">{kase.problemDescription}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Modals */}
      {modal.kind === "schedule" && <ScheduleVisitModal caseId={kase.id} defaultType={modal.defaultType} onClose={closeModal} />}
      {modal.kind === "edit-visit" && <EditVisitModal visit={modal.visit} caseId={kase.id} onClose={closeModal} />}
      {modal.kind === "complete-visit" && <CompleteVisitModal visit={modal.visit} caseId={kase.id} onClose={closeModal} />}
      {modal.kind === "add-photo" && <AddPhotoModal visitId={modal.visitId} caseId={kase.id} onClose={closeModal} />}
      {modal.kind === "pick-treatment" && <TreatmentPickerModal caseId={kase.id} onClose={closeModal} />}
      {modal.kind === "confirm-status" && (
        <ConfirmDialog
          title={CONFIRM_COPY[modal.status].title}
          message={CONFIRM_COPY[modal.status].message}
          danger={CONFIRM_COPY[modal.status].danger}
          busy={updateCase.isPending}
          onConfirm={() => void handleStatusConfirm(modal.status)}
          onCancel={closeModal}
        />
      )}
    </div>
  );
}

function VisitCard({
  visit,
  onStart,
  onComplete,
  onEdit,
  onAddPhoto,
}: {
  visit: CaseVisit;
  onStart: () => void;
  onComplete: () => void;
  onEdit: () => void;
  onAddPhoto: () => void;
}) {
  return (
    <div className="visit-card">
      <div className="visit-card__top">
        <span className="visit-card__type">{VISIT_TYPE_LABELS_FR[visit.type]}</span>
        <VisitStatusBadge status={visit.status} />
      </div>
      <div className="visit-card__meta">
        <span>
          <strong>{formatRelativeDay(visit.scheduledAt)}</strong>
        </span>
        <span>{visit.assignedWorker ? fullName(visit.assignedWorker) : "Non assigné"}</span>
      </div>
      {visit.notes && <p className="muted" style={{ fontSize: 12.5, marginTop: 6 }}>{visit.notes}</p>}
      {visit.inspection && (
        <dl className="visit-card__inspection">
          {visit.inspection.condition && (
            <>
              <dt>État constaté</dt>
              <dd>{visit.inspection.condition}</dd>
            </>
          )}
          {visit.inspection.observations && (
            <>
              <dt>Observations</dt>
              <dd>{visit.inspection.observations}</dd>
            </>
          )}
          {visit.inspection.remarks && (
            <>
              <dt>Remarques</dt>
              <dd>{visit.inspection.remarks}</dd>
            </>
          )}
        </dl>
      )}
      <div className="visit-card__actions">
        {visit.status === "SCHEDULED" && (
          <button type="button" className="btn btn--sm" onClick={onStart}>
            Démarrer
          </button>
        )}
        {(visit.status === "IN_PROGRESS" || visit.status === "SCHEDULED") && (
          <button type="button" className="btn btn--sm btn--primary" onClick={onComplete}>
            Terminer
          </button>
        )}
        {visit.status !== "COMPLETED" && visit.status !== "CANCELLED" && (
          <button type="button" className="btn btn--sm btn--icon" title="Modifier" onClick={onEdit}>
            <IconEdit style={{ width: 13, height: 13 }} />
          </button>
        )}
        <button type="button" className="btn btn--sm" onClick={onAddPhoto}>
          <IconImage style={{ width: 13, height: 13 }} /> Photo
        </button>
      </div>
    </div>
  );
}
