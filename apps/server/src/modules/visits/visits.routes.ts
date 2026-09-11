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
import { emitVisitUpdated } from "../../realtime/socket.js";
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
    res.status(201).json(photo);
  } catch (err) {
    next(err);
  }
});
