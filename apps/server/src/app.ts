import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { clientOrigins, env, isProduction } from "./config/env.js";
import { CorsOriginError, errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");

  // Production deployment targets (Railway, Render, Fly.io, a VPS behind
  // Nginx) all terminate TLS one hop in front of this process — Express
  // sees a plain HTTP connection from the proxy's own IP unless told to
  // trust the X-Forwarded-* headers the proxy sets. Without this,
  // `req.ip` (what authRateLimiter keys its per-IP limit on) is the
  // *proxy's* IP for every request, collapsing the rate limit onto one
  // shared bucket for every real client — a genuine production bug, not
  // just cosmetic. `1` = trust exactly one hop, which covers every
  // platform in the list above; a deployment with an extra hop in front
  // (e.g. Cloudflare -> Nginx -> this process) should raise this to `2`.
  // Left off (`false`) outside production so a local dev server never
  // trusts headers a same-machine client could spoof.
  app.set("trust proxy", isProduction ? 1 : false);

  app.use(helmet());
  app.use(
    cors({
      // Requests with no Origin header (native mobile fetch, curl,
      // server-to-server) aren't a CORS concern and are always allowed.
      //
      // A packaged desktop build's renderer runs at
      // `http://127.0.0.1:47829` — a loopback-only local HTTP server the
      // Electron main process starts itself (see apps/desktop/electron/
      // main.cts's doc comment: an earlier version loaded via `file://`
      // instead, which turned out to break every `fetch()` call in a real
      // packaged build — a documented Electron bug, electron/electron
      // #3922 — found by actually installing and running the Windows
      // installer, not by inspection; see CONTEXT.md session 8). Allowed
      // explicitly here, not via CLIENT_ORIGIN: it's the same fixed
      // origin for every install of this app on every machine, and it's
      // provably safe to allow unconditionally — loopback-only, so it can
      // never be reached from outside the user's own machine, and no real
      // web page can make a browser claim to *be* that origin.
      //
      // Every other browser-origin request must match one of
      // CLIENT_ORIGIN's comma-separated entries.
      origin(origin, callback) {
        if (!origin || origin === "http://127.0.0.1:47829" || clientOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new CorsOriginError(`Origin ${origin} is not allowed by CORS`));
        }
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(express.urlencoded({ extended: true }));
  if (env.NODE_ENV !== "test") {
    app.use(morgan(env.NODE_ENV === "development" ? "dev" : "combined"));
  }

  // Static serving for locally-stored photo uploads (dev only — see
  // src/storage; production will point STORAGE_PUBLIC_URL at S3/R2 instead).
  // helmet()'s default Cross-Origin-Resource-Policy is "same-origin",
  // which silently blocks a browser-based client on a different origin
  // (the desktop's Vite dev server, mobile running on Expo web) from
  // loading these images at all — found via the mobile E2E test's photo
  // thumbnails failing with ERR_BLOCKED_BY_RESPONSE.NotSameOrigin. These
  // are uploaded case photos meant to be viewed by any authenticated
  // client, not same-origin-only assets, so relax it for this mount only
  // (the rest of the app keeps helmet's stricter JSON-API defaults).
  app.use("/uploads", helmet.crossOriginResourcePolicy({ policy: "cross-origin" }), express.static(env.STORAGE_LOCAL_ROOT));

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
