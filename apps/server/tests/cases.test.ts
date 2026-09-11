import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, authHeader, createAdmin, createCustomerFixture, createPropertyFixture, createWorker } from "./helpers.js";

describe("POST /api/cases (manual intake)", () => {
  it("creates a case with brand-new customer + property, defaults to status NEW, and logs a CASE_CREATED activity", async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .post("/api/cases")
      .set(...authHeader(admin.accessToken))
      .send({
        customer: { firstName: "Jane", lastName: "Doe", phone: "555-1111", email: "jane@example.com" },
        property: { address: "10 Main St", city: "Springfield", postalCode: "62701" },
        problemDescription: "Mice heard in the walls at night.",
        priority: "HIGH",
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("NEW");
    expect(res.body.priority).toBe("HIGH");
    expect(res.body.customer.firstName).toBe("Jane");
    expect(res.body.property.address).toBe("10 Main St");
    expect(res.body.activities).toHaveLength(1);
    expect(res.body.activities[0].type).toBe("CASE_CREATED");
  });

  it("accepts an existing customerId/propertyId instead of nested objects", async () => {
    const admin = await createAdmin();
    const customer = await createCustomerFixture({ firstName: "Repeat" });
    const property = await createPropertyFixture({ address: "Existing Ave" });

    const res = await request(app)
      .post("/api/cases")
      .set(...authHeader(admin.accessToken))
      .send({ customerId: customer.id, propertyId: property.id, problemDescription: "Follow-up issue at same property." });

    expect(res.status).toBe(201);
    expect(res.body.customer.id).toBe(customer.id);
    expect(res.body.property.id).toBe(property.id);
  });

  it("schedules the initial inspection in the same call and status becomes SCHEDULED", async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .post("/api/cases")
      .set(...authHeader(admin.accessToken))
      .send({
        customer: { firstName: "Sam", lastName: "Smith", phone: "555-2222" },
        property: { address: "5 Pine Rd", city: "Springfield", postalCode: "62701" },
        problemDescription: "Ants in the pantry.",
        initialVisitScheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe("SCHEDULED");
    expect(res.body.visits).toHaveLength(1);
    expect(res.body.visits[0].type).toBe("INITIAL_INSPECTION");
  });

  it("rejects a body with neither customerId nor customer (and neither propertyId nor property)", async () => {
    const admin = await createAdmin();

    const res = await request(app)
      .post("/api/cases")
      .set(...authHeader(admin.accessToken))
      .send({ problemDescription: "Missing everything else." });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toHaveProperty("customer");
    expect(res.body.error.details).toHaveProperty("property");
  });

  it("rejects both customerId AND customer being provided at once", async () => {
    const admin = await createAdmin();
    const customer = await createCustomerFixture();

    const res = await request(app)
      .post("/api/cases")
      .set(...authHeader(admin.accessToken))
      .send({
        customerId: customer.id,
        customer: { firstName: "Dup", lastName: "Licate", phone: "555-3333" },
        property: { address: "1 A St", city: "Town", postalCode: "00000" },
        problemDescription: "x",
      });

    expect(res.status).toBe(400);
    expect(res.body.error.details).toHaveProperty("customer");
  });

  it("is admin-only — a worker gets 403, not a validation error", async () => {
    const worker = await createWorker();

    const res = await request(app)
      .post("/api/cases")
      .set(...authHeader(worker.accessToken))
      .send({ problemDescription: "irrelevant" });

    expect(res.status).toBe(403);
  });
});
