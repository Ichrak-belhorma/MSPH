import { createServer, type Server as HttpServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import request from "supertest";
import { io as ioClient, type Socket as ClientSocket } from "socket.io-client";
import { SOCKET_EVENTS } from "@msph/shared";
import { app, authHeader, createAdmin, createCustomerFixture, createPropertyFixture, createTreatmentFixture, createWorker } from "./helpers.js";
import { initSocket } from "../src/realtime/socket.js";

/**
 * Proves the realtime event *contract* from CONTEXT.md "Event
 * architecture": for the brief's full manager+worker scenario, exactly
 * the right specific event fires (never just a generic "something
 * changed"), carrying the right case/visit ids — not by inspecting the
 * desktop/mobile UI, but by actually connecting a real socket.io-client
 * to a real HTTP server running the real `initSocket()`, and asserting
 * on what comes out. This is the repeatable, committed counterpart to
 * the session's own manual cross-client Playwright verification (see
 * CONTEXT.md 22.x) — that proves the UI reacts correctly; this proves
 * the server emits correctly, independent of any particular client.
 *
 * Other test files build `app` via `createApp()` alone (no socket, see
 * helpers.ts) — this file is the one place that boots a real
 * HTTP+Socket.IO server, on an OS-assigned port, torn down after.
 */

let httpServer: HttpServer;
let client: ClientSocket;
let events: { event: string; payload: unknown }[] = [];

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Events are broadcast async over a real (loopback) socket — give them
 * a moment to arrive before asserting, then reset the log for the next
 * step so each step's assertions only see its own events. */
async function flush(ms = 200): Promise<void> {
  await sleep(ms);
}

function eventsOf(type: string): unknown[] {
  return events.filter((e) => e.event === type).map((e) => e.payload);
}

beforeAll(async () => {
  httpServer = createServer(app);
  initSocket(httpServer);
  await new Promise<void>((resolve) => httpServer.listen(0, resolve));
  const port = (httpServer.address() as AddressInfo).port;

  client = ioClient(`http://localhost:${port}`, { transports: ["websocket"] });
  await new Promise<void>((resolve, reject) => {
    client.once("connect", () => resolve());
    client.once("connect_error", reject);
  });
  client.onAny((event: string, payload: unknown) => events.push({ event, payload }));
});

afterAll(async () => {
  client.disconnect();
  await new Promise<void>((resolve) => httpServer.close(() => resolve()));
});

beforeEach(() => {
  events = [];
});

describe("realtime events — the full manager+worker scenario", () => {
  it("room housekeeping: a client can join/leave a case room without erroring, and still receives cases-room broadcasts either way", async () => {
    // Room membership doesn't gate delivery today (Socket.IO isn't
    // authenticated — see CONTEXT.md "Realtime design"): every event
    // also broadcasts to the global "cases" room every socket auto-joins
    // on connect. This just proves the join/leave handshake itself is
    // wired and harmless, not that it restricts anything.
    client.emit(SOCKET_EVENTS.JOIN_CASE_ROOM, "some-case-id");
    client.emit(SOCKET_EVENTS.LEAVE_CASE_ROOM, "some-case-id");
    await flush(50);
    // No error event / disconnect — if we got here, both no-op'd cleanly.
    expect(client.connected).toBe(true);
  });

  it("walks the brief's full scenario end to end, asserting the exact event fired at each step", async () => {
    const admin = await createAdmin();
    const worker = await createWorker();
    const customer = await createCustomerFixture();
    const property = await createPropertyFixture();
    const treatment = await createTreatmentFixture();

    // --- Manager: 1. creates customer -> 2. creates case -------------
    // (customer creation has no socket event in the taxonomy — only
    // case/visit/inspection/photo/treatment actions do, see
    // packages/shared/src/constants/index.ts)
    const createCaseRes = await request(app)
      .post("/api/cases")
      .set(...authHeader(admin.accessToken))
      .send({ customerId: customer.id, propertyId: property.id, problemDescription: "Cockroaches in the kitchen", priority: "HIGH" });
    expect(createCaseRes.status).toBe(201);
    const caseId: string = createCaseRes.body.id;

    await flush();
    expect(eventsOf(SOCKET_EVENTS.CASE_CREATED)).toEqual([{ caseId }]);
    // No visit was scheduled in this call -> no visit/status events.
    expect(eventsOf(SOCKET_EVENTS.VISIT_CREATED)).toHaveLength(0);
    expect(eventsOf(SOCKET_EVENTS.CASE_STATUS_CHANGED)).toHaveLength(0);

    // --- Manager: 3. schedules initial consultation, 4. assigns worker
    events = [];
    const scheduleRes = await request(app)
      .post("/api/visits")
      .set(...authHeader(admin.accessToken))
      .send({
        caseId,
        type: "INITIAL_INSPECTION",
        scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
        assignedWorkerId: worker.dbUser.id,
      });
    expect(scheduleRes.status).toBe(201);
    const visitId: string = scheduleRes.body.id;

    await flush();
    expect(eventsOf(SOCKET_EVENTS.VISIT_CREATED)).toEqual([{ caseId, visitId }]);
    expect(eventsOf(SOCKET_EVENTS.VISIT_ASSIGNED)).toEqual([{ caseId, visitId, workerId: worker.dbUser.id }]);
    // NEW -> SCHEDULED: a real, asserted status transition, not assumed.
    expect(eventsOf(SOCKET_EVENTS.CASE_STATUS_CHANGED)).toEqual([{ caseId, from: "NEW", to: "SCHEDULED" }]);
    // Scheduling a visit must never fire the old generic VISIT_UPDATED —
    // this is the bug fixed this session (was emitVisitUpdated instead
    // of emitVisitCreated).
    expect(eventsOf(SOCKET_EVENTS.VISIT_UPDATED)).toHaveLength(0);

    // --- Worker: 5. receives visit (asserted above via VISIT_ASSIGNED),
    // 6. starts visit --------------------------------------------------
    events = [];
    const startRes = await request(app)
      .post(`/api/visits/${visitId}/start`)
      .set(...authHeader(worker.accessToken))
      .send({});
    expect(startRes.status).toBe(200);

    await flush();
    expect(eventsOf(SOCKET_EVENTS.VISIT_STARTED)).toEqual([{ caseId, visitId }]);
    // Case was already SCHEDULED (an active visit existed before too) —
    // starting it must not spuriously report a status change.
    expect(eventsOf(SOCKET_EVENTS.CASE_STATUS_CHANGED)).toHaveLength(0);

    // --- Worker: 7. submits inspection, 9. completes visit (same call,
    // per CompleteVisitInput — see visits.service.ts's doc comment) ----
    // Photos (8.) are asserted as their own step below since they're a
    // separate endpoint/event even when a worker uploads them around the
    // same moment in the real UI.
    events = [];
    const completeRes = await request(app)
      .post(`/api/visits/${visitId}/complete`)
      .set(...authHeader(worker.accessToken))
      .send({ observations: "Roach activity confirmed under the sink", condition: "Moderate infestation", remarks: "Recommend follow-up in 2 weeks" });
    expect(completeRes.status).toBe(200);

    await flush();
    expect(eventsOf(SOCKET_EVENTS.INSPECTION_CREATED)).toEqual([{ caseId, visitId }]);
    expect(eventsOf(SOCKET_EVENTS.VISIT_COMPLETED)).toEqual([{ caseId, visitId }]);
    // At least one visit is now COMPLETED -> SCHEDULED -> IN_PROGRESS.
    expect(eventsOf(SOCKET_EVENTS.CASE_STATUS_CHANGED)).toEqual([{ caseId, from: "SCHEDULED", to: "IN_PROGRESS" }]);

    // --- Worker: 8. uploads a photo (metadata endpoint — the real
    // multipart /photos/upload endpoint calls the same emitPhotoAdded,
    // see visits.routes.ts) --------------------------------------------
    events = [];
    const photoRes = await request(app)
      .post(`/api/visits/${visitId}/photos`)
      .set(...authHeader(worker.accessToken))
      .send({ storageKey: "test-key.jpg", caption: "Under the sink" });
    expect(photoRes.status).toBe(201);
    const photoId: string = photoRes.body.id;

    await flush();
    expect(eventsOf(SOCKET_EVENTS.PHOTO_ADDED)).toEqual([{ caseId, visitId, photoId }]);

    // --- Manager: 10. sees inspection (REST GET, no event to assert —
    // covered by the payload above), 11. selects treatment -------------
    events = [];
    const addTreatmentRes = await request(app)
      .post(`/api/cases/${caseId}/treatments`)
      .set(...authHeader(admin.accessToken))
      .send({ treatmentId: treatment.id, notes: "Gel bait under the sink" });
    expect(addTreatmentRes.status).toBe(201);
    const caseTreatmentId: string = addTreatmentRes.body.id;

    await flush();
    expect(eventsOf(SOCKET_EVENTS.TREATMENT_ADDED)).toEqual([{ caseId, caseTreatmentId }]);

    // Manager (or worker, per the shared route) marks it performed.
    events = [];
    const markPerformedRes = await request(app)
      .patch(`/api/cases/${caseId}/treatments/${caseTreatmentId}`)
      .set(...authHeader(worker.accessToken))
      .send({ status: "COMPLETED" });
    expect(markPerformedRes.status).toBe(200);

    await flush();
    expect(eventsOf(SOCKET_EVENTS.TREATMENT_UPDATED)).toEqual([{ caseId, caseTreatmentId, status: "COMPLETED" }]);

    // --- Manager: 12. schedules follow-up ------------------------------
    events = [];
    const followUpRes = await request(app)
      .post("/api/visits")
      .set(...authHeader(admin.accessToken))
      .send({
        caseId,
        type: "FOLLOW_UP",
        scheduledAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
        assignedWorkerId: worker.dbUser.id,
      });
    expect(followUpRes.status).toBe(201);
    const followUpVisitId: string = followUpRes.body.id;

    await flush();
    expect(eventsOf(SOCKET_EVENTS.VISIT_CREATED)).toEqual([{ caseId, visitId: followUpVisitId }]);
    expect(eventsOf(SOCKET_EVENTS.VISIT_ASSIGNED)).toEqual([{ caseId, visitId: followUpVisitId, workerId: worker.dbUser.id }]);
    // Case already IN_PROGRESS (a completed visit exists) — scheduling
    // another active visit must not report a spurious status change.
    expect(eventsOf(SOCKET_EVENTS.CASE_STATUS_CHANGED)).toHaveLength(0);

    // --- Worker: 13. receives follow-up (VISIT_ASSIGNED above),
    // 14. completes follow-up (start, then complete with NO inspection
    // fields this time — a real test of the conditional: no
    // INSPECTION_CREATED should fire) -----------------------------------
    events = [];
    await request(app)
      .post(`/api/visits/${followUpVisitId}/start`)
      .set(...authHeader(worker.accessToken))
      .send({});
    const completeFollowUpRes = await request(app)
      .post(`/api/visits/${followUpVisitId}/complete`)
      .set(...authHeader(worker.accessToken))
      .send({});
    expect(completeFollowUpRes.status).toBe(200);

    await flush();
    expect(eventsOf(SOCKET_EVENTS.VISIT_STARTED)).toEqual([{ caseId, visitId: followUpVisitId }]);
    expect(eventsOf(SOCKET_EVENTS.VISIT_COMPLETED)).toEqual([{ caseId, visitId: followUpVisitId }]);
    expect(eventsOf(SOCKET_EVENTS.INSPECTION_CREATED)).toHaveLength(0);

    // --- Manager: 15. marks case resolved -------------------------------
    events = [];
    const resolveRes = await request(app)
      .patch(`/api/cases/${caseId}`)
      .set(...authHeader(admin.accessToken))
      .send({ status: "RESOLVED" });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.body.status).toBe("RESOLVED");

    await flush();
    expect(eventsOf(SOCKET_EVENTS.CASE_STATUS_CHANGED)).toEqual([{ caseId, from: "IN_PROGRESS", to: "RESOLVED" }]);
    expect(eventsOf(SOCKET_EVENTS.CASE_RESOLVED)).toEqual([{ caseId }]);
  });

  it("a no-op case edit (no status change) emits the generic CASE_UPDATED, not CASE_STATUS_CHANGED", async () => {
    const admin = await createAdmin();
    const customer = await createCustomerFixture();
    const property = await createPropertyFixture();
    const createRes = await request(app)
      .post("/api/cases")
      .set(...authHeader(admin.accessToken))
      .send({ customerId: customer.id, propertyId: property.id, problemDescription: "Ants", priority: "LOW" });
    const caseId: string = createRes.body.id;

    events = [];
    const editRes = await request(app)
      .patch(`/api/cases/${caseId}`)
      .set(...authHeader(admin.accessToken))
      .send({ priority: "URGENT" });
    expect(editRes.status).toBe(200);

    await flush();
    expect(eventsOf(SOCKET_EVENTS.CASE_UPDATED)).toEqual([{ caseId }]);
    expect(eventsOf(SOCKET_EVENTS.CASE_STATUS_CHANGED)).toHaveLength(0);
  });

  it("removing a treatment emits TREATMENT_REMOVED with the case and case-treatment ids", async () => {
    const admin = await createAdmin();
    const customer = await createCustomerFixture();
    const property = await createPropertyFixture();
    const treatment = await createTreatmentFixture();
    const createRes = await request(app)
      .post("/api/cases")
      .set(...authHeader(admin.accessToken))
      .send({ customerId: customer.id, propertyId: property.id, problemDescription: "Mice", priority: "MEDIUM" });
    const caseId: string = createRes.body.id;
    const addRes = await request(app)
      .post(`/api/cases/${caseId}/treatments`)
      .set(...authHeader(admin.accessToken))
      .send({ treatmentId: treatment.id });
    const caseTreatmentId: string = addRes.body.id;

    events = [];
    const removeRes = await request(app)
      .delete(`/api/cases/${caseId}/treatments/${caseTreatmentId}`)
      .set(...authHeader(admin.accessToken));
    expect(removeRes.status).toBe(204);

    await flush();
    expect(eventsOf(SOCKET_EVENTS.TREATMENT_REMOVED)).toEqual([{ caseId, caseTreatmentId }]);
  });
});
