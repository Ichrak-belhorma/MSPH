import { resolveApiConfig, looksInsecureForProduction, MissingApiUrlError, type ApiConfig } from "@msph/shared";

/**
 * The one place `VITE_API_BASE_URL`/`VITE_SOCKET_URL` are read.
 * `apiClient.ts` and `lib/socket.ts` both call `getApiBaseUrl()`/
 * `getSocketUrl()` from here — never `import.meta.env` directly — so
 * there is exactly one URL-resolution policy in the app (`@msph/shared`'s
 * `resolveApiConfig`, see its doc comment for the full dev/production
 * rule).
 *
 * `import.meta.env.DEV`/`.PROD` are Vite-provided booleans: `true`/`false`
 * are baked in at build time depending on `vite dev` vs `vite build` — not
 * something a runtime env var can spoof after the fact.
 *
 * A production build (`pnpm --filter @msph/desktop build`) with no
 * `VITE_API_BASE_URL` makes every getter here throw `MissingApiUrlError`
 * — see `main.tsx`'s startup guard (`getConfigError()`), which turns this
 * into a readable on-screen message instead of a blank white window or a
 * confusing "Server unreachable" once requests start failing. Silently
 * trying `localhost` inside a packaged Electron app on a user's machine
 * would just look like "the app is broken", with no clue why — see
 * CONTEXT.md session 7.
 */
/**
 * `main.cts` optionally reads `msph-config.json` (a plain runtime file next
 * to `package.json` in dev, next to the installed `.exe` in production —
 * see its own doc comment) and appends `apiBaseUrl`/`socketUrl` as query
 * params on whatever URL it loads. Checked here, ahead of the Vite-baked
 * `VITE_API_BASE_URL`, so that file — when present — always wins: it's a
 * plain-text file read with bare `fs.readFileSync`, no bundler involved,
 * meant as a foolproof fallback for when `.env`/`.env.production` loading
 * doesn't behave as expected (see CONTEXT.md session 8).
 */
function readRuntimeConfigParam(name: "apiBaseUrl" | "socketUrl"): string | undefined {
  const value = new URLSearchParams(window.location.search).get(name);
  return value && value.trim() !== "" ? value : undefined;
}

function loadConfig(): ApiConfig {
  const config = resolveApiConfig(
    {
      rawApiUrl: readRuntimeConfigParam("apiBaseUrl") ?? import.meta.env.VITE_API_BASE_URL,
      rawSocketUrl: readRuntimeConfigParam("socketUrl") ?? import.meta.env.VITE_SOCKET_URL,
      isDev: import.meta.env.DEV,
    },
    "VITE_API_BASE_URL",
  );
  if (looksInsecureForProduction(config.apiBaseUrl, import.meta.env.DEV)) {
    // Not fatal — see looksInsecureForProduction's doc comment — but
    // worth a loud warning in the packaged app's DevTools console.
    console.warn(`[config] VITE_API_BASE_URL="${config.apiBaseUrl}" is not HTTPS. A real production API must be served over HTTPS.`);
  }
  return config;
}

/** Resolved (or failed) once, cached — every caller sees the same result
 * no matter which module imports this first. */
let cached: ApiConfig | MissingApiUrlError | undefined;

function resolve(): ApiConfig | MissingApiUrlError {
  if (cached === undefined) {
    try {
      cached = loadConfig();
    } catch (err) {
      if (!(err instanceof MissingApiUrlError)) throw err;
      cached = err;
    }
  }
  return cached;
}

function getConfig(): ApiConfig {
  const result = resolve();
  if (result instanceof MissingApiUrlError) throw result;
  return result;
}

/** Exposed for `main.tsx`'s startup guard — checks for a configuration
 * error without throwing, so the app can render a clear message instead
 * of a blank crashed window. */
export function getConfigError(): MissingApiUrlError | null {
  const result = resolve();
  return result instanceof MissingApiUrlError ? result : null;
}

export function getApiBaseUrl(): string {
  return getConfig().apiBaseUrl;
}

export function getSocketUrl(): string {
  return getConfig().socketUrl;
}

/** `import.meta.env.DEV` isn't enough on its own to show a "using local
 * dev API" indicator — a *production* build could still (deliberately,
 * for a staging environment) end up pointed at a non-production URL.
 * `source === "dev-default"` is the precise signal: nobody configured
 * anything, this is the hardcoded localhost fallback. Shown by
 * `AppShell` as a small "API locale" badge so nobody mistakes a dev
 * build pointed at localhost for a real connection to a real server. */
export function isUsingDevDefaultApi(): boolean {
  return getConfig().source === "dev-default";
}
