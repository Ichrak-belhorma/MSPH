import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, authHeader, createAdmin, createCaseFixture, createWorker } from "./helpers.js";

describe("scheduling and performing a visit", () => {
  it("admin schedules a visit and the case status auto-transitions NEW -> SCHEDULED", async () => {
    const admin = await createAdmin();
    const { case: kase } = await createCaseFixture();

    const res = await request(app)
      .post("/api/visits")
      .set(...authHeader(admin.accessToken))
      .send({ caseId: kase.id, type: "INITIAL_INSPECTION", scheduledAt: new Date(Date.now() + 3600_000).toISOString() });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("SCHEDULED");
    expect(res.body.case.status).toBe("SCHEDULED");
  });

  it("a worker cannot schedule a visit (admin-only) even though they can start/complete one", async () => {
    const worker = await createWorker();
    const { case: kase } = await createCaseFixture();

    const res = await request(app)
      .post("/api/visits")
      .set(...authHeader(worker.accessToken))
      .send({ caseId: kase.id, type: "INITIAL_INSPECTION", scheduledAt: new Date().toISOString(), assignedWorkerId: worker.dbUser.id });

    expect(res.status).toBe(403);
  });

  describe("case/visit access scoping for workers", () => {
    async function scheduleAssignedVisit(adminToken: string, caseId: string, workerId: string) {
      const res = await request(app)
        .post("/api/visits")
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          caseId,
          type: "INITIAL_INSPECTION",
          scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
          assignedWorkerId: workerId,
        });
      expect(res.status).toBe(201);
      return res.body;
    }

    it("a worker with no assigned visit on a case gets 403 from GET /cases/:id", async () => {
      const worker = await createWorker();
      const { case: kase } = await createCaseFixture();

      const res = await request(app)
        .get(`/api/cases/${kase.id}`)
        .set(...authHeader(worker.accessToken));

      expect(res.status).toBe(403);
    });

    it("once assigned to a visit on the case, the worker can GET the case and the visit", async () => {
      const admin = await createAdmin();
      const worker = await createWorker();
      const { case: kase } = await createCaseFixture();
      const visit = await scheduleAssignedVisit(admin.accessToken, kase.id, worker.dbUser.id);

      const caseRes = await request(app)
        .get(`/api/cases/${kase.id}`)
        .set(...authHeader(worker.accessToken));
      expect(caseRes.status).toBe(200);

      const visitRes = await request(app)
        .get(`/api/visits/${visit.id}`)
        .set(...authHeader(worker.accessToken));
      expect(visitRes.status).toBe(200);
    });

    it("a DIFFERENT worker (not assigned) still gets 403 on both the case and the visit", async () => {
      const admin = await createAdmin();
      const assignedWorker = await createWorker();
      const otherWorker = await createWorker();
      const { case: kase } = await createCaseFixture();
      const visit = await scheduleAssignedVisit(admin.accessToken, kase.id, assignedWorker.dbUser.id);

      const caseRes = await request(app)
        .get(`/api/cases/${kase.id}`)
        .set(...authHeader(otherWorker.accessToken));
      expect(caseRes.status).toBe(403);

      const visitRes = await request(app)
        .get(`/api/visits/${visit.id}`)
        .set(...authHeader(otherWorker.accessToken));
      expect(visitRes.status).toBe(403);
    });

    it("a worker cannot start/complete a visit that isn't assigned to them", async () => {
      const admin = await createAdmin();
      const assignedWorker = await createWorker();
      const otherWorker = await createWorker();
      const { case: kase } = await createCaseFixture();
      const visit = await scheduleAssignedVisit(admin.accessToken, kase.id, assignedWorker.dbUser.id);

      const startRes = await request(app)
        .post(`/api/visits/${visit.id}/start`)
        .set(...authHeader(otherWorker.accessToken))
        .send({});
      expect(startRes.status).toBe(403);
    });
  });

  it("the assigned worker can start then complete their visit, recording the inspection and moving the case to IN_PROGRESS", async () => {
    const admin = await createAdmin();
    const worker = await createWorker();
    const { case: kase } = await createCaseFixture();

    const scheduled = await request(app)
      .post("/api/visits")
      .set(...authHeader(admin.accessToken))
      .send({
        caseId: kase.id,
        type: "INITIAL_INSPECTION",
        scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
        assignedWorkerId: worker.dbUser.id,
      });
    const visitId = scheduled.body.id;

    const started = await request(app)
      .post(`/api/visits/${visitId}/start`)
      .set(...authHeader(worker.accessToken))
      .send({});
    expect(started.status).toBe(200);
    expect(started.body.status).toBe("IN_PROGRESS");
    expect(started.body.startedAt).toEqual(expect.any(String));

    const completed = await request(app)
      .post(`/api/visits/${visitId}/complete`)
      .set(...authHeader(worker.accessToken))
      .send({ observations: "Droppings found near the pantry.", condition: "Moderate rodent activity" });

    expect(completed.status).toBe(200);
    expect(completed.body.status).toBe("COMPLETED");
    expect(completed.body.inspection.observations).toBe("Droppings found near the pantry.");
    expect(completed.body.case.status).toBe("IN_PROGRESS");

    const timeline = await request(app)
      .get(`/api/cases/${kase.id}/timeline`)
      .set(...authHeader(admin.accessToken));
    const types = timeline.body.map((a: { type: string }) => a.type);
    expect(types).toEqual(
      expect.arrayContaining(["VISIT_SCHEDULED", "WORKER_ASSIGNED", "VISIT_STARTED", "VISIT_COMPLETED", "INSPECTION_RECORDED"]),
    );
  });

  describe("failure paths", () => {
    it("completing an already-completed visit twice is a safe no-op, not a duplicated timeline/completedAt overwrite", async () => {
      // Reproduces "duplicate submission" / "visit completed twice" from
      // the brief: a dropped response on a flaky connection, or a
      // double-tap, causes the same POST /complete to land server-side
      // twice.
      const admin = await createAdmin();
      const worker = await createWorker();
      const { case: kase } = await createCaseFixture();

      const scheduled = await request(app)
        .post("/api/visits")
        .set(...authHeader(admin.accessToken))
        .send({
          caseId: kase.id,
          type: "INITIAL_INSPECTION",
          scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
          assignedWorkerId: worker.dbUser.id,
        });
      const visitId = scheduled.body.id;

      await request(app).post(`/api/visits/${visitId}/start`).set(...authHeader(worker.accessToken)).send({});

      const first = await request(app)
        .post(`/api/visits/${visitId}/complete`)
        .set(...authHeader(worker.accessToken))
        .send({ observations: "First pass" });
      expect(first.status).toBe(200);
      const firstCompletedAt = first.body.completedAt;

      // Retry — the worker's client never saw the first response.
      const second = await request(app)
        .post(`/api/visits/${visitId}/complete`)
        .set(...authHeader(worker.accessToken))
        .send({ observations: "Second pass, should be ignored" });
      expect(second.status).toBe(200);
      expect(second.body.status).toBe("COMPLETED");
      // completedAt must not have been bumped to "now" on the retry.
      expect(second.body.completedAt).toBe(firstCompletedAt);
      // The original observations must not have been overwritten.
      expect(second.body.inspection.observations).toBe("First pass");

      const timeline = await request(app)
        .get(`/api/cases/${kase.id}/timeline`)
        .set(...authHeader(admin.accessToken));
      const completedCount = timeline.body.filter((a: { type: string }) => a.type === "VISIT_COMPLETED").length;
      expect(completedCount).toBe(1);
    });

    it("cannot schedule a visit on a resolved case", async () => {
      const admin = await createAdmin();
      const { case: kase } = await createCaseFixture();

      const resolve = await request(app)
        .patch(`/api/cases/${kase.id}`)
        .set(...authHeader(admin.accessToken))
        .send({ status: "RESOLVED" });
      expect(resolve.status).toBe(200);

      const res = await request(app)
        .post("/api/visits")
        .set(...authHeader(admin.accessToken))
        .send({ caseId: kase.id, type: "FOLLOW_UP", scheduledAt: new Date(Date.now() + 3600_000).toISOString() });
      expect(res.status).toBe(400);
    });

    it("a well-formed but non-existent case id 404s instead of 500ing", async () => {
      const admin = await createAdmin();
      const res = await request(app)
        .get("/api/cases/clxxxxxxxxxxxxxxxxxxxxxxxx")
        .set(...authHeader(admin.accessToken));
      expect(res.status).toBe(404);
    });

    it("a non-cuid-shaped but non-empty case id still 404s cleanly, not 500s (cuidSchema is deliberately permissive — see its doc comment)", async () => {
      const admin = await createAdmin();
      const res = await request(app)
        .get("/api/cases/not-a-cuid")
        .set(...authHeader(admin.accessToken));
      expect(res.status).toBe(404);
    });

    it("an empty case id segment 400s (validation)", async () => {
      const admin = await createAdmin();
      const res = await request(app)
        .get("/api/cases/%20")
        .set(...authHeader(admin.accessToken));
      expect(res.status).toBe(400);
    });
  });
});
