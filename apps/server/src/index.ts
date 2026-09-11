import { createServer } from "node:http";
import { createApp } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./lib/logger.js";
import { prisma } from "./lib/prisma.js";
import { initSocket } from "./realtime/socket.js";

/** How long a shutdown is allowed to wait for in-flight HTTP requests and
 * open Socket.IO connections to drain before giving up and force-exiting
 * anyway. A rolling deploy on the platforms this targets (Railway/Render/
 * Fly.io) typically gives a process ~10-30s between SIGTERM and a hard
 * SIGKILL — this stays comfortably under that. */
const SHUTDOWN_TIMEOUT_MS = 10_000;

async function main() {
  const app = createApp();
  const httpServer = createServer(app);
  const io = initSocket(httpServer);

  httpServer.listen(env.PORT, () => {
    logger.info(`MSPH server listening on port ${env.PORT}`, {
      env: env.NODE_ENV,
      port: env.PORT,
    });
  });

  let shuttingDown = false;

  const shutdown = async (signal: string) => {
    // A second SIGTERM (common — some orchestrators send it twice) should
    // not re-enter this and race a second prisma.$disconnect()/exit.
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`Received ${signal}, shutting down gracefully`);

    const forceExitTimer = setTimeout(() => {
      logger.warn(`Graceful shutdown exceeded ${SHUTDOWN_TIMEOUT_MS}ms, forcing exit`);
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExitTimer.unref();

    try {
      // `httpServer.close()`'s callback only fires once every connection
      // is done — a plain HTTP keep-alive connection finishes on its own
      // shortly, but an open Socket.IO (WebSocket) connection stays open
      // indefinitely unless actually told to disconnect, which would
      // otherwise make this hang until the timeout above forces it.
      // `io.close()` does exactly that (also stops the Socket.IO server
      // from accepting new connections) before we wait on the HTTP server
      // itself — so a real deploy drains cleanly well under the timeout,
      // it isn't just a safety net for a bug.
      io?.close();
      await new Promise<void>((resolve, reject) => {
        httpServer.close((err) => (err ? reject(err) : resolve()));
      });
      await prisma.$disconnect();
      clearTimeout(forceExitTimer);
      logger.info("Shutdown complete");
      process.exit(0);
    } catch (err) {
      clearTimeout(forceExitTimer);
      logger.error("Error during graceful shutdown", {
        message: err instanceof Error ? err.message : String(err),
      });
      process.exit(1);
    }
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  logger.error("Fatal error during startup", {
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});
