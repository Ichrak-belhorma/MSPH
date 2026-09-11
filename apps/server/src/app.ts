import cors from "cors";
import express, { type Express } from "express";
import helmet from "helmet";
import morgan from "morgan";
import { clientOrigins, env } from "./config/env.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";

export function createApp(): Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      // Requests with no Origin header (native mobile fetch, curl,
      // server-to-server) aren't a CORS concern and are always allowed;
      // browser-origin requests must match one of CLIENT_ORIGIN's
      // comma-separated entries.
      origin(origin, callback) {
        if (!origin || clientOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`Origin ${origin} is not allowed by CORS`));
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
  app.use("/uploads", express.static(env.STORAGE_LOCAL_ROOT));

  app.use("/api", apiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
