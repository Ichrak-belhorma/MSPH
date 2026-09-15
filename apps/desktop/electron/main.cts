import { app, BrowserWindow } from "electron";
import { createServer, type Server } from "node:http";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
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

/**
 * `msph-config.json` — a plain-text, runtime-read config file, checked
 * on every launch. Read here with a bare `fs.readFileSync` — no Vite, no
 * `.env` file, no build-time env-var baking, no encoding footguns from a
 * text editor (all of which turned out to be real, repeated trouble on
 * one real Windows machine trying to configure `VITE_API_BASE_URL` via
 * `.env`/`.env.production` — see CONTEXT.md session 8's long debugging
 * log). This is the SIMPLEST possible mechanism, specifically so it's
 * trivial to verify by eye: open the file, read the one line in it.
 *
 * If present and valid, this takes priority over the Vite-baked
 * `VITE_API_BASE_URL` (passed to the renderer as a query string param on
 * the URL it loads, below) — but `VITE_API_BASE_URL` still works exactly
 * as before if this file doesn't exist; this is an additional, more
 * foolproof option, not a replacement.
 *
 * Location:
 *   - Packaged build: next to the installed `.exe` — the most
 *     discoverable possible place ("open the folder you installed MSPH
 *     into"). Writable without admin rights because this project's NSIS
 *     config installs per-user (`perMachine: false`).
 *   - Dev: `apps/desktop/msph-config.json`, next to `package.json`.
 */
function loadRuntimeConfig(): { apiBaseUrl?: string; socketUrl?: string } {
  const configPath = isDev
    ? path.join(__dirname, "../msph-config.json")
    : path.join(path.dirname(app.getPath("exe")), "msph-config.json");
  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as { apiBaseUrl?: unknown; socketUrl?: unknown };
    const apiBaseUrl = typeof parsed.apiBaseUrl === "string" ? parsed.apiBaseUrl.trim() : undefined;
    const socketUrl = typeof parsed.socketUrl === "string" ? parsed.socketUrl.trim() : undefined;
    console.log(`[msph-config] loaded ${configPath}:`, { apiBaseUrl, socketUrl });
    return { apiBaseUrl: apiBaseUrl || undefined, socketUrl: socketUrl || undefined };
  } catch (err) {
    // Optional file — absent or invalid just means "use VITE_API_BASE_URL
    // instead", not an error. Still logged (not silent) so a launch's own
    // console output says exactly what happened, for anyone debugging.
    console.log(`[msph-config] no usable config at ${configPath} (${err instanceof Error ? err.message : String(err)}) — falling back to VITE_API_BASE_URL`);
    return {};
  }
}

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

/** Appends `apiBaseUrl`/`socketUrl` query params when `msph-config.json`
 * provided them — `src/config.ts` reads these (via
 * `window.location.search`) before falling back to the Vite-baked
 * `VITE_API_BASE_URL`. A query param survives regardless of how the page
 * was loaded (dev server or the local renderer server above) and needs
 * no preload/contextBridge/IPC plumbing. */
function withRuntimeConfig(url: string, runtimeConfig: { apiBaseUrl?: string; socketUrl?: string }): string {
  const params = new URLSearchParams();
  if (runtimeConfig.apiBaseUrl) params.set("apiBaseUrl", runtimeConfig.apiBaseUrl);
  if (runtimeConfig.socketUrl) params.set("socketUrl", runtimeConfig.socketUrl);
  const query = params.toString();
  return query ? `${url}?${query}` : url;
}

function createMainWindow(runtimeConfig: { apiBaseUrl?: string; socketUrl?: string }): void {
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
    win.loadURL(withRuntimeConfig("http://localhost:5173", runtimeConfig));
    win.webContents.openDevTools({ mode: "detach" });
  } else {
    win.loadURL(withRuntimeConfig(`http://127.0.0.1:${RENDERER_PORT}/index.html`, runtimeConfig));
  }
}

app.whenReady().then(async () => {
  registerSecureStorageIpc();
  const runtimeConfig = loadRuntimeConfig();
  if (!isDev) {
    await startRendererServer(path.join(__dirname, "../dist"));
  }
  createMainWindow(runtimeConfig);

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow(runtimeConfig);
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
