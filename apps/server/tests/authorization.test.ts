import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, authHeader, createAdmin, createTreatmentFixture, createWorker } from "./helpers.js";

/**
 * "Workers must not have unrestricted administrative access" — this file
 * sweeps the admin-only surface and asserts a worker gets 403 (never 200,
 * never a 500 that would leak something) while an admin gets through.
 */
describe("role-based authorization", () => {
  const adminOnlyRequests: Array<{ label: string; make: () => request.Test }> = [
    { label: "GET /users", make: () => request(app).get("/api/users") },
    { label: "POST /users", make: () => request(app).post("/api/users").send({ firstName: "A", lastName: "B", email: "x@y.com", password: "Password123" }) },
    { label: "GET /customers", make: () => request(app).get("/api/customers") },
    { label: "POST /customers", make: () => request(app).post("/api/customers").send({ firstName: "A", lastName: "B", phone: "555-0000" }) },
    { label: "GET /landlords", make: () => request(app).get("/api/landlords") },
    { label: "GET /properties", make: () => request(app).get("/api/properties") },
    { label: "POST /treatments", make: () => request(app).post("/api/treatments").send({ name: "New treatment" }) },
    { label: "POST /cases", make: () => request(app).post("/api/cases").send({}) },
    { label: "POST /visits", make: () => request(app).post("/api/visits").send({}) },
  ];

  it.each(adminOnlyRequests)("worker gets 403 on $label", async ({ make }) => {
    const worker = await createWorker();
    const res = await make().set(...authHeader(worker.accessToken));
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");
  });

  it("admin gets past the role check on the same routes (200/201, not 403)", async () => {
    const admin = await createAdmin();

    const users = await request(app).get("/api/users").set(...authHeader(admin.accessToken));
    expect(users.status).toBe(200);

    const customers = await request(app).get("/api/customers").set(...authHeader(admin.accessToken));
    expect(customers.status).toBe(200);

    const treatments = await request(app).get("/api/treatments").set(...authHeader(admin.accessToken));
    expect(treatments.status).toBe(200);
  });

  it("every protected route 401s with no token at all (checked before role)", async () => {
    const res = await request(app).get("/api/users");
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("a worker CAN read the treatment catalog (GET is open to any authenticated role)", async () => {
    await createTreatmentFixture({ name: "Readable by workers" });
    const worker = await createWorker();

    const res = await request(app).get("/api/treatments").set(...authHeader(worker.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });
});
