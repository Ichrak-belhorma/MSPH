import { app, BrowserWindow } from "electron";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { registerSecureStorageIpc } from "./secureStorage.cjs";

// Compiled to CommonJS (see tsconfig.electron.json), so __dirname is
// available natively at runtime.
const isDev = process.env.NODE_ENV === "development";

/**
 * A packaged production build never loads the renderer via `file://`.
 * Electron's `fetch()` has a long-standing, documented incompatibility
 * with pages loaded from the `file://` origin — a cross-origin request
 * (exactly what every API call here is) fails, typically with
 * `net::ERR_FILE_NOT_FOUND`, even though the same request works fine
 * over plain HTTP or in dev (see electron/electron#3922; confirmed here
 * by actually installing and running the packaged Windows build and
 * seeing the login request fail this exact way — see CONTEXT.md session
 * 8). This app's whole API client (`src/lib/apiClient.ts`) is built on
 * `fetch()`, so instead of `win.loadFile()`, the renderer is served over
 * plain HTTP from a tiny static file server bound to loopback-only — a
 * normal `http://127.0.0.1` origin, `fetch()` behaves exactly as it
 * does against the Vite dev server.
 *
 * Fixed port (not ephemeral) so this is a stable, known origin —
 * `apps/server/src/app.ts`'s CORS config allows it unconditionally (see
 * its own comment: safe, since it's loopback-only, never reachable from
 * outside this machine or from a real web page).
 */
const RENDERER_PORT = 47829;

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

/** Serves the built renderer (`dist/`, packed into `app.asar` — Electron
 * transparently patches `fs` to read through the archive, so this needs
 * no `asarUnpack` entry) over loopback HTTP. Every path without a file
 * extension is treated as client-side routing and served `index.html` —
 * this app's renderer is a single-page app (react-router), there's only
 * one real HTML entry point. */
function startRendererServer(distDir: string): Promise<Server> {
  return new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      void (async () => {
        try {
          const requestPath = decodeURIComponent((req.url ?? "/").split("?")[0] ?? "/");
          const hasExtension = path.extname(requestPath) !== "";
          const relativePath = hasExtension ? requestPath : "/index.html";
          const resolved = path.normalize(path.join(distDir, relativePath));
          // Contain within distDir — this only ever serves this app's own
          // bundled output, but a request path is never trusted blindly.
          if (!resolved.startsWith(distDir)) {
            res.writeHead(403).end();
            return;
          }
          const body = await readFile(resolved);
          const contentType = MIME_TYPES[path.extname(resolved)] ?? "application/octet-stream";
          res.writeHead(200, { "Content-Type": contentType });
          res.end(body);
        } catch {
          res.writeHead(404).end("Not found");
        }
      })();
    });
    server.once("error", reject);
    server.listen(RENDERER_PORT, "127.0.0.1", () => resolve(server));
  });
}

function createMainWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    title: "MSPH",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadURL(`http://127.0.0.1:${RENDERER_PORT}/index.html`);
  }
}

app.whenReady().then(async () => {
  registerSecureStorageIpc();
  if (!isDev) {
    await startRendererServer(path.join(__dirname, "../dist"));
  }
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
