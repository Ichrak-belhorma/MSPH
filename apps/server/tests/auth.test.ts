import { describe, expect, it } from "vitest";
import request from "supertest";
import { app, authHeader, createUserFixture, loginAs } from "./helpers.js";

describe("POST /api/auth/login", () => {
  it("logs in with correct credentials and never exposes the password hash", async () => {
    const { user, password } = await createUserFixture({ email: "login-ok@test.local" });

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password });

    expect(res.status).toBe(200);
    expect(res.body.accessToken).toEqual(expect.any(String));
    expect(res.body.refreshToken).toEqual(expect.any(String));
    expect(res.body.user.id).toBe(user.id);
    expect(res.body.user.email).toBe(user.email);
    expect(res.body.user).not.toHaveProperty("passwordHash");
  });

  it("rejects a wrong password", async () => {
    const { user } = await createUserFixture({ email: "login-bad@test.local" });

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects an unknown email with the same error as a wrong password (no user enumeration)", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "nobody@test.local", password: "whatever123" });
    expect(res.status).toBe(401);
  });

  it("rejects a deactivated user", async () => {
    const { user, password } = await createUserFixture({ email: "login-inactive@test.local", active: false });

    const res = await request(app).post("/api/auth/login").send({ email: user.email, password });

    expect(res.status).toBe(403);
  });

  it("400s on a malformed request body instead of 500ing", async () => {
    const res = await request(app).post("/api/auth/login").send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.details).toHaveProperty("password");
  });
});

describe("refresh token rotation", () => {
  it("issues a new pair and revokes the old one; reusing the old one fails", async () => {
    const { user, password } = await createUserFixture({ email: "refresh@test.local" });
    const first = await loginAs(user.email, password);

    const refreshed = await request(app).post("/api/auth/refresh").send({ refreshToken: first.refreshToken });
    expect(refreshed.status).toBe(200);
    expect(refreshed.body.accessToken).toEqual(expect.any(String));
    expect(refreshed.body.refreshToken).not.toBe(first.refreshToken);

    // The original refresh token was rotated away — presenting it again
    // must fail (reuse detection), not silently succeed.
    const reused = await request(app).post("/api/auth/refresh").send({ refreshToken: first.refreshToken });
    expect(reused.status).toBe(401);
  });

  it("reuse of a rotated-away token revokes every session for that user", async () => {
    const { user, password } = await createUserFixture({ email: "refresh-theft@test.local" });
    const first = await loginAs(user.email, password);
    const second = await request(app).post("/api/auth/refresh").send({ refreshToken: first.refreshToken });
    expect(second.status).toBe(200);

    // Simulate theft: the original (now-revoked) token is presented again.
    await request(app).post("/api/auth/refresh").send({ refreshToken: first.refreshToken });

    // The legitimately-rotated token must now be dead too.
    const thirdAttempt = await request(app).post("/api/auth/refresh").send({ refreshToken: second.body.refreshToken });
    expect(thirdAttempt.status).toBe(401);
  });
});

describe("GET /api/me", () => {
  it("requires a bearer token", async () => {
    const res = await request(app).get("/api/me");
    expect(res.status).toBe(401);
  });

  it("returns the authenticated user's own profile", async () => {
    const { user, password } = await createUserFixture({ email: "me@test.local", firstName: "Meg" });
    const session = await loginAs(user.email, password);

    const res = await request(app).get("/api/me").set(...authHeader(session.accessToken));

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.firstName).toBe("Meg");
  });

  it("rejects a garbage bearer token", async () => {
    const res = await request(app).get("/api/me").set("Authorization", "Bearer not-a-real-token");
    expect(res.status).toBe(401);
  });
});
