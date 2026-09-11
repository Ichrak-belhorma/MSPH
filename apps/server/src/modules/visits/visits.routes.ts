import { Router } from "express";
import {
  addVisitPhotoSchema,
  completeVisitSchema,
  cuidSchema,
  recordInspectionSchema,
  scheduleVisitSchema,
  startVisitSchema,
  updateVisitSchema,
  visitListQuerySchema,
} from "@msph/shared";
import type {
  AddVisitPhotoInput,
  CompleteVisitInput,
  RecordInspectionInput,
  ScheduleVisitInput,
  StartVisitInput,
  UpdateVisitInput,
  VisitListQuery,
} from "@msph/shared";
import { requireAdmin, requireAuth } from "../../middleware/auth.js";
import { body, query, validateBody, validateQuery } from "../../middleware/validate.js";
import { emitVisitUpdated } from "../../realtime/socket.js";
import * as visitsService from "./visits.service.js";

export const visitsRouter = Router();

visitsRouter.use(requireAuth);

visitsRouter.get("/", validateQuery(visitListQuerySchema), async (req, res, next) => {
  try {
    res.json(await visitsService.listVisits(query<VisitListQuery>(req), req.user!));
  } catch (err) {
    next(err);
  }
});

visitsRouter.post("/", requireAdmin, validateBody(scheduleVisitSchema), async (req, res, next) => {
  try {
    const visit = await visitsService.scheduleVisit(body<ScheduleVisitInput>(req), req.user!.id);
    emitVisitUpdated(visit.caseId, visit.id);
    res.status(201).json(visit);
  } catch (err) {
    next(err);
  }
});

visitsRouter.get("/:id", async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    res.json(await visitsService.getVisit(id, req.user!));
  } catch (err) {
    next(err);
  }
});

visitsRouter.patch("/:id", requireAdmin, validateBody(updateVisitSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    const visit = await visitsService.updateVisit(id, body<UpdateVisitInput>(req), req.user!.id);
    emitVisitUpdated(visit.caseId, visit.id);
    res.json(visit);
  } catch (err) {
    next(err);
  }
});

visitsRouter.post("/:id/start", validateBody(startVisitSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    const visit = await visitsService.startVisit(id, body<StartVisitInput>(req), req.user!);
    emitVisitUpdated(visit.caseId, visit.id);
    res.json(visit);
  } catch (err) {
    next(err);
  }
});

visitsRouter.post("/:id/complete", validateBody(completeVisitSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    const visit = await visitsService.completeVisit(id, body<CompleteVisitInput>(req), req.user!);
    emitVisitUpdated(visit.caseId, visit.id);
    res.json(visit);
  } catch (err) {
    next(err);
  }
});

visitsRouter.post("/:id/inspection", validateBody(recordInspectionSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    const inspection = await visitsService.recordInspection(id, body<RecordInspectionInput>(req), req.user!);
    res.status(201).json(inspection);
  } catch (err) {
    next(err);
  }
});

visitsRouter.post("/:id/photos", validateBody(addVisitPhotoSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    const photo = await visitsService.addPhotoToVisit(id, body<AddVisitPhotoInput>(req), req.user!);
    res.status(201).json(photo);
  } catch (err) {
    next(err);
  }
});
