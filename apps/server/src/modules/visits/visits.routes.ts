import { Router } from "express";
import multer from "multer";
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
import {
  emitCaseStatusChanged,
  emitInspectionCreated,
  emitPhotoAdded,
  emitVisitAssigned,
  emitVisitCompleted,
  emitVisitCreated,
  emitVisitStarted,
  emitVisitUpdated,
} from "../../realtime/socket.js";
import { ApiError } from "../../middleware/errorHandler.js";
import * as visitsService from "./visits.service.js";

// Memory storage: files are small (photos from a phone camera, capped
// below) and the storage driver wants the whole buffer anyway to write it
// in one shot — no benefit to touching disk twice via multer's own disk
// storage first.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB — a few phone photos, not a video
  fileFilter(_req, file, cb) {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image uploads are allowed"));
      return;
    }
    cb(null, true);
  },
});

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
    const input = body<ScheduleVisitInput>(req);
    const { visit, statusChange } = await visitsService.scheduleVisit(input, req.user!.id);
    // Scenario 2 / Scenario 5 (follow-up): a new visit was scheduled —
    // VISIT_CREATED, not the old (buggy) VISIT_UPDATED, so a client can
    // tell "a visit now exists" apart from "a visit changed". If it came
    // with an assigned worker, that worker's device specifically wants
    // VISIT_ASSIGNED to know "you have a new visit" without diffing.
    emitVisitCreated(visit.caseId, visit.id);
    if (input.assignedWorkerId) emitVisitAssigned(visit.caseId, visit.id, input.assignedWorkerId);
    if (statusChange) emitCaseStatusChanged(visit.caseId, statusChange.from, statusChange.to);
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
    const { visit, statusChange, workerAssignmentChanged, assignedWorkerId } = await visitsService.updateVisit(
      id,
      body<UpdateVisitInput>(req),
      req.user!.id,
    );
    // A reassignment is the specific thing a worker's device cares about
    // (Scenario 2); anything else (reschedule, notes, cancel/no-show)
    // is the generic VISIT_UPDATED — both are never emitted for the same
    // change, so a listener sees exactly one event per actual edit.
    if (workerAssignmentChanged) {
      emitVisitAssigned(visit.caseId, visit.id, assignedWorkerId);
    } else {
      emitVisitUpdated(visit.caseId, visit.id);
    }
    if (statusChange) emitCaseStatusChanged(visit.caseId, statusChange.from, statusChange.to);
    res.json(visit);
  } catch (err) {
    next(err);
  }
});

visitsRouter.post("/:id/start", validateBody(startVisitSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    const { visit, statusChange } = await visitsService.startVisit(id, body<StartVisitInput>(req), req.user!);
    // Scenario 3: worker starts a visit -> desktop receives VISIT_STARTED.
    emitVisitStarted(visit.caseId, visit.id);
    if (statusChange) emitCaseStatusChanged(visit.caseId, statusChange.from, statusChange.to);
    res.json(visit);
  } catch (err) {
    next(err);
  }
});

visitsRouter.post("/:id/complete", validateBody(completeVisitSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    const { visit, statusChange, inspectionRecorded } = await visitsService.completeVisit(
      id,
      body<CompleteVisitInput>(req),
      req.user!,
    );
    // Scenario 4: worker completes inspection -> desktop receives
    // INSPECTION_CREATED (when observations/remarks/condition were
    // submitted in this call, per CompleteVisitInput's doc comment) and
    // VISIT_COMPLETED. Photos are a separate endpoint/event (PHOTO_ADDED,
    // below) even when uploaded around the same moment in the UI.
    if (inspectionRecorded) emitInspectionCreated(visit.caseId, visit.id);
    emitVisitCompleted(visit.caseId, visit.id);
    if (statusChange) emitCaseStatusChanged(visit.caseId, statusChange.from, statusChange.to);
    res.json(visit);
  } catch (err) {
    next(err);
  }
});

visitsRouter.post("/:id/inspection", validateBody(recordInspectionSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    const { inspection, caseId } = await visitsService.recordInspection(id, body<RecordInspectionInput>(req), req.user!);
    emitInspectionCreated(caseId, id);
    res.status(201).json(inspection);
  } catch (err) {
    next(err);
  }
});

visitsRouter.post("/:id/photos", validateBody(addVisitPhotoSchema), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    const photo = await visitsService.addPhotoToVisit(id, body<AddVisitPhotoInput>(req), req.user!);
    emitPhotoAdded(photo.caseId, photo.visitId, photo.id);
    res.status(201).json(photo);
  } catch (err) {
    next(err);
  }
});

/**
 * Real binary upload — added for the mobile app (session 4): a worker's
 * camera photo as multipart form data (`multer`'s memory storage, field
 * name "photo") rather than the metadata-only JSON endpoint above (which
 * still exists for anything that already has a storageKey/URL, e.g. a
 * future desktop file picker). The upload is written by `storageDriver`
 * (`src/storage`) and only *then* turned into the same Photo row the
 * metadata endpoint creates — so a failed disk write never produces a
 * database row that lies about a photo existing.
 */
visitsRouter.post("/:id/photos/upload", upload.single("photo"), async (req, res, next) => {
  try {
    const id = cuidSchema.parse(req.params.id);
    if (!req.file) {
      throw ApiError.badRequest('No file uploaded (expected multipart field "photo")');
    }
    const caption = typeof req.body?.caption === "string" && req.body.caption.trim() ? req.body.caption.trim().slice(0, 300) : undefined;
    const photo = await visitsService.uploadPhotoToVisit(
      id,
      { buffer: req.file.buffer, originalName: req.file.originalname, mimeType: req.file.mimetype, caption },
      req.user!,
    );
    emitPhotoAdded(photo.caseId, photo.visitId, photo.id);
    res.status(201).json(photo);
  } catch (err) {
    next(err);
  }
});
