import { describe, expect, it } from "vitest";
import request from "supertest";
import { app } from "./helpers.js";

/**
 * `app.ts` unconditionally allows two fixed local origins regardless of
 * CLIENT_ORIGIN — the packaged desktop's loopback renderer server, and
 * Vite's default dev-server port (needed so `pnpm dev` can be pointed at
 * a deployed API without depending on that deployment's CLIENT_ORIGIN
 * happening to include it — see CONTEXT.md session 8, where exactly this
 * broke). Locking both in here so a future CLIENT_ORIGIN-related change
 * can't silently regress either one.
 */
describe("CORS", () => {
  it("allows the packaged desktop's loopback renderer origin unconditionally", async () => {
    const res = await request(app).options("/api/auth/login").set("Origin", "http://127.0.0.1:47829").set("Access-Control-Request-Method", "POST");

    expect(res.headers["access-control-allow-origin"]).toBe("http://127.0.0.1:47829");
  });

  it("allows Vite's default dev-server origin unconditionally", async () => {
    const res = await request(app).options("/api/auth/login").set("Origin", "http://localhost:5173").set("Access-Control-Request-Method", "POST");

    expect(res.headers["access-control-allow-origin"]).toBe("http://localhost:5173");
  });

  it("rejects an origin not in CLIENT_ORIGIN and not one of the fixed exceptions", async () => {
    const res = await request(app).options("/api/auth/login").set("Origin", "http://evil.example.com").set("Access-Control-Request-Method", "POST");

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();
  });
});
