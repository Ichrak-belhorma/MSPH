import { Router } from "express";
import {
  assignTreatmentToCaseSchema,
  caseListQuerySchema,
  createCaseSchema,
  cuidSchema,
  updateCaseSchema,
  updateCaseTreatmentSchema,
} from "@msph/shared";
import type { AssignTreatmentToCaseInput, CaseListQuery, CreateCaseInput, UpdateCaseInput, UpdateCaseTreatmentInput } from "@msph/shared";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { assertCaseAccess } from "../../lib/authz.js";
import { body, query, validateBody, validateQuery } from "../../middleware/validate.js";
import {
  emitCaseCreated,
  emitCaseStatusChanged,
  emitCaseUpdated,
  emitTreatmentAdded,
  emitTreatmentRemoved,
  emitTreatmentUpdated,
  emitVisitAssigned,
  emitVisitCreated,
} from "../../realtime/socket.js";
import * as casesService from "./cases.service.js";
import * as caseTreatmentsService from "./case-treatments.service.js";

export const casesRouter = Router();

casesRouter.use(requireAuth);

casesRouter.get("/", validateQuery(caseListQuerySchema), async (req, res, next) => {
  try {
    res.json(await casesService.listCases(query<CaseListQuery>(req), req.user!));
  } catch (err) {
    next(err);
  }
});

// Manual intake workflow (brief: "a manager reads an incoming email and
// enters the case") — ADMIN-only, workers don't create cases.
casesRouter.post("/", requireAdmin, validateBody(createCaseSchema), async (req, res, next) => {
  try {
    const { case: kase, createdVisitId, assignedWorkerId, statusChange } = await casesService.createCase(
      body<CreateCaseInput>(req),
      req.user!.id,
    );
    // Scenario 1: case created -> CASE_CREATED. If the same submission
    // also scheduled the initial consultation (createCaseSchema allows
    // this in one request, see 3.8), that's real, separate news too —
    // a worker's device specifically wants VISIT_ASSIGNED, not just a
    // generic "the case changed".
    emitCaseCreated(kase.id);
    if (createdVisitId) {
      emitVisitCreated(kase.id, createdVisitId);
      if (assignedWorkerId) emitVisitAssigned(kase.id, createdVisitId, assignedWorkerId);
    }
    if (statusChange) emitCaseStatusChanged(kase.id, statusChange.from, statusChange.to);
    res.status(201).json(kase);
  } catch (err) {
    next(err);
  }
});

casesRouter.get("/:id", async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    res.json(await casesService.getCase(id, req.user!));
  } catch (err) {
    next(err);
  }
});

casesRouter.patch("/:id", requireAdmin, validateBody(updateCaseSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    const { case: kase, statusChange } = await casesService.updateCase(id, body<UpdateCaseInput>(req), req.user!.id);
    // Scenario 6 ("Manager marks case resolved"): a status change (resolve/
    // cancel/reopen, or the rarer admin PATCH straight to another status)
    // is always the more specific, more useful event — CASE_UPDATED alone
    // would make a client re-check everything to notice a status flip.
    // Emit CASE_UPDATED too only when nothing more specific applies
    // (a plain problemDescription/priority edit), so a listener that only
    // cares about status changes isn't woken for those.
    if (statusChange) {
      emitCaseStatusChanged(id, statusChange.from, statusChange.to);
    } else {
      emitCaseUpdated(id);
    }
    res.json(kase);
  } catch (err) {
    next(err);
  }
});

casesRouter.get("/:id/timeline", async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    res.json(await casesService.getCaseTimeline(id, req.user!));
  } catch (err) {
    next(err);
  }
});

// --- Case-treatments -------------------------------------------------

casesRouter.post("/:id/treatments", requireAdmin, validateBody(assignTreatmentToCaseSchema), async (req, res, next) => {
  try {
    const caseId = cuidSchema.parse(req.params.id);
    const caseTreatment = await caseTreatmentsService.addTreatmentToCase(caseId, body<AssignTreatmentToCaseInput>(req), req.user!.id);
    emitTreatmentAdded(caseId, caseTreatment.id);
    res.status(201).json(caseTreatment);
  } catch (err) {
    next(err);
  }
});

casesRouter.patch("/:id/treatments/:caseTreatmentId", validateBody(updateCaseTreatmentSchema), async (req, res, next) => {
  try {
    const caseId = cuidSchema.parse(req.params.id);
    const caseTreatmentId = cuidSchema.parse(req.params.caseTreatmentId);
    // Worker may only record execution on a case they're assigned to;
    // admins can always do this. Adding/removing treatments stays
    // admin-only (see the two routes above/below).
    await assertCaseAccess(caseId, req.user!);
    const updated = await caseTreatmentsService.updateCaseTreatment(caseId, caseTreatmentId, body<UpdateCaseTreatmentInput>(req), req.user!.id);
    emitTreatmentUpdated(caseId, updated.id, updated.status);
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

casesRouter.delete("/:id/treatments/:caseTreatmentId", requireAdmin, async (req, res, next) => {
  try {
    const caseId = cuidSchema.parse(req.params.id);
    const caseTreatmentId = cuidSchema.parse(req.params.caseTreatmentId);
    await caseTreatmentsService.removeTreatmentFromCase(caseId, caseTreatmentId, req.user!.id);
    emitTreatmentRemoved(caseId, caseTreatmentId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
