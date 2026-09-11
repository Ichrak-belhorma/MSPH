import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, authHeader, createAdmin, createTreatmentFixture, createWorker } from "./helpers.js";

/**
 * The "Done criteria" walkthrough from the task brief, as one test:
 * create case -> schedule visit -> assign worker -> complete inspection
 * -> add treatment -> record treatment execution -> schedule a follow-up
 * -> complete it -> resolve the case. Exercises the CaseStatus state
 * machine across a full loop (NEW -> SCHEDULED -> IN_PROGRESS, twice,
 * then -> RESOLVED) rather than just a single visit.
 */
describe("full case lifecycle", () => {
  it("takes a case from intake to resolved", async () => {
    const admin = await authHeader((await createAdmin()).accessToken);
    const worker = await createWorker();
    const treatment = await createTreatmentFixture({ name: "Full lifecycle treatment" });

    // 1. Create the case (manual intake).
    const created = await request(app)
      .post("/api/cases")
      .set(...admin)
      .send({
        customer: { firstName: "Lifecycle", lastName: "Tester", phone: "555-9000" },
        property: { address: "1 Workflow Way", city: "Springfield", postalCode: "62701" },
        problemDescription: "Recurring pest issue for full lifecycle test.",
        priority: "MEDIUM",
      });
    expect(created.status).toBe(201);
    expect(created.body.status).toBe("NEW");
    const caseId = created.body.id;

    // 2. Schedule the initial inspection, assigned to the worker.
    const visit1 = await request(app)
      .post("/api/visits")
      .set(...admin)
      .send({
        caseId,
        type: "INITIAL_INSPECTION",
        scheduledAt: new Date(Date.now() + 3600_000).toISOString(),
        assignedWorkerId: worker.dbUser.id,
      });
    expect(visit1.status).toBe(201);
    expect((await request(app).get(`/api/cases/${caseId}`).set(...admin)).body.status).toBe("SCHEDULED");

    // 3. Worker performs the inspection.
    await request(app).post(`/api/visits/${visit1.body.id}/start`).set(...authHeader(worker.accessToken)).send({});
    const completed1 = await request(app)
      .post(`/api/visits/${visit1.body.id}/complete`)
      .set(...authHeader(worker.accessToken))
      .send({ observations: "Confirmed activity", condition: "Moderate" });
    expect(completed1.status).toBe(200);
    expect(completed1.body.case.status).toBe("IN_PROGRESS");

    // 4. Admin chooses a treatment for the case.
    const caseTreatment = await request(app)
      .post(`/api/cases/${caseId}/treatments`)
      .set(...admin)
      .send({ treatmentId: treatment.id, notes: "Standard protocol" });
    expect(caseTreatment.status).toBe(201);
    expect(caseTreatment.body.status).toBe("PLANNED");

    // 5. Worker records the treatment as performed.
    const performedTreatment = await request(app)
      .patch(`/api/cases/${caseId}/treatments/${caseTreatment.body.id}`)
      .set(...authHeader(worker.accessToken))
      .send({ status: "COMPLETED" });
    expect(performedTreatment.status).toBe(200);
    expect(performedTreatment.body.status).toBe("COMPLETED");
    expect(performedTreatment.body.performedBy).toBe(worker.dbUser.id);

    // 6. Schedule + complete a follow-up visit — the case should loop
    //    back through SCHEDULED and IN_PROGRESS again, not get stuck.
    const visit2 = await request(app)
      .post("/api/visits")
      .set(...admin)
      .send({
        caseId,
        type: "FOLLOW_UP",
        scheduledAt: new Date(Date.now() + 7 * 86_400_000).toISOString(),
        assignedWorkerId: worker.dbUser.id,
      });
    expect(visit2.status).toBe(201);
    await request(app).post(`/api/visits/${visit2.body.id}/start`).set(...authHeader(worker.accessToken)).send({});
    const completed2 = await request(app)
      .post(`/api/visits/${visit2.body.id}/complete`)
      .set(...authHeader(worker.accessToken))
      .send({ observations: "No further activity observed", condition: "Resolved" });
    expect(completed2.body.case.status).toBe("IN_PROGRESS");

    // 7. A worker cannot resolve the case themselves.
    const workerResolveAttempt = await request(app)
      .patch(`/api/cases/${caseId}`)
      .set(...authHeader(worker.accessToken))
      .send({ status: "RESOLVED" });
    expect(workerResolveAttempt.status).toBe(403);

    // 8. Admin marks the case resolved.
    const resolved = await request(app).patch(`/api/cases/${caseId}`).set(...admin).send({ status: "RESOLVED" });
    expect(resolved.status).toBe(200);
    expect(resolved.body.status).toBe("RESOLVED");
    expect(resolved.body.resolvedAt).toEqual(expect.any(String));

    // 9. Resolution is terminal — scheduling another visit is rejected.
    const rejectedVisit = await request(app)
      .post("/api/visits")
      .set(...admin)
      .send({ caseId, type: "FOLLOW_UP", scheduledAt: new Date(Date.now() + 86_400_000).toISOString() });
    expect(rejectedVisit.status).toBe(400);

    // 10. The timeline tells the whole story in order.
    const timeline = await request(app).get(`/api/cases/${caseId}/timeline`).set(...admin);
    const types = timeline.body.map((a: { type: string }) => a.type);
    expect(types[0]).toBe("CASE_CREATED");
    expect(types).toEqual(
      expect.arrayContaining([
        "VISIT_SCHEDULED",
        "VISIT_STARTED",
        "VISIT_COMPLETED",
        "INSPECTION_RECORDED",
        "TREATMENT_ADDED",
        "TREATMENT_UPDATED",
        "CASE_RESOLVED",
      ]),
    );
  });
});
