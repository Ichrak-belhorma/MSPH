/**
 * Shared API-URL resolution policy for every client (desktop, mobile, and
 * any future one). This is *policy*, not env-var reading — Vite
 * (`import.meta.env.VITE_*`) and Expo (`process.env.EXPO_PUBLIC_*`) each
 * inline their env vars differently at build time, so each app still has
 * its own tiny `config.ts` that reads its own bundler's env vars and calls
 * `resolveApiConfig` here. What's centralized is the *rule*:
 *
 *   - An explicit, non-empty URL env var always wins.
 *   - In a development build (`isDev: true`), no env var set falls back to
 *     `http://localhost:<DEFAULT_DEV_API_PORT>/api` — convenient for
 *     `pnpm dev:*`, obviously wrong the moment you're not on the same
 *     machine as the API (a physical phone, a packaged desktop build), so
 *     every mobile screen must never lean on this without the developer
 *     explicitly opting in — see each app's own config.ts doc comment.
 *   - In a production build (`isDev: false`), no env var set is a
 *     *configuration error*, not a silent fallback to localhost — the
 *     previous design's actual bug (see CONTEXT.md session 7): a
 *     production mobile/desktop build with no `EXPO_PUBLIC_API_BASE_URL`/
 *     `VITE_API_BASE_URL` baked in at build time would otherwise silently
 *     try to reach `localhost` *on the end user's own device*, which can
 *     never work and produces exactly the confusing "Server unreachable"
 *     symptom this module exists to make impossible to ship again.
 *
 * `localhost` never appears in this module except as the one clearly-
 * labeled development fallback, guarded by `isDev`.
 */

/** Only ever used when `isDev` is true and no env var is set. Never used
 * in a production build — see `resolveApiConfig`. */
export const DEFAULT_DEV_API_PORT = 4000;
export const DEFAULT_DEV_API_URL = `http://localhost:${DEFAULT_DEV_API_PORT}/api`;

export interface ResolveApiConfigInput {
  /** The platform's public API base URL env var, e.g.
   * `import.meta.env.VITE_API_BASE_URL` or
   * `process.env.EXPO_PUBLIC_API_BASE_URL`. */
  rawApiUrl: string | undefined;
  /** The platform's public Socket.IO URL env var, if the project wants to
   * point realtime at a different host than the REST API (rare — usually
   * left unset so it derives from `rawApiUrl`). */
  rawSocketUrl?: string | undefined;
  /** True for a development build/server (Vite's `import.meta.env.DEV`,
   * Expo's `__DEV__`), false for a production build. Must come from the
   * calling app — this module has no way to know on its own. */
  isDev: boolean;
}

export interface ApiConfig {
  apiBaseUrl: string;
  socketUrl: string;
  /** `"env"` — an explicit URL was configured (the only source a
   * production build should ever report). `"dev-default"` — no env var
   * was set and `isDev` allowed falling back to localhost. Clients use
   * this to show an obvious "using local dev API" indicator so nobody
   * mistakes a dev build pointed at localhost for a real connection to a
   * real environment. */
  source: "env" | "dev-default";
}

/** Thrown by `resolveApiConfig` when a production build has no API URL
 * configured. Deliberately loud (a thrown error, not a silently-wrong
 * default) — see this module's doc comment for why. Each app's own
 * config.ts decides how to surface this (a startup error screen, not a
 * vague network-error toast once requests start failing). */
export class MissingApiUrlError extends Error {
  constructor(envVarName: string) {
    super(
      `${envVarName} is not set. This is a production build, which must have a ` +
        `real HTTPS API URL baked in at build time (e.g. "https://api.your-domain.com") ` +
        `— see README.md "Environment variables" and CONTEXT.md "Production deployment". ` +
        `Refusing to fall back to localhost: that would silently try to reach the ` +
        `end user's own device, not your API server.`,
    );
    this.name = "MissingApiUrlError";
  }
}

function deriveSocketUrl(apiBaseUrl: string): string {
  return apiBaseUrl.replace(/\/api\/?$/, "");
}

/**
 * True when a configured (non-dev-default) URL looks like a production
 * mistake — plain HTTP outside of dev. Not enforced (thrown) here: some
 * legitimate setups (an internal VPN-only API, a reverse proxy that only
 * terminates TLS one hop further out) use plain HTTP even in a
 * "production" build. Each app's own config.ts decides what to do with
 * this (e.g. a console warning) — kept out of `resolveApiConfig` itself
 * so this module has no side effects and no runtime-specific globals
 * (`console`, `window`, ...), since it's imported by the Node server too.
 */
export function looksInsecureForProduction(apiBaseUrl: string, isDev: boolean): boolean {
  return !isDev && !apiBaseUrl.startsWith("https://");
}

/**
 * Resolves the API base URL + Socket.IO URL an app should use, per the
 * policy documented above. `envVarName` is only used to make a thrown
 * `MissingApiUrlError` name the exact variable to set (different per app:
 * `VITE_API_BASE_URL` for desktop, `EXPO_PUBLIC_API_BASE_URL` for mobile).
 */
export function resolveApiConfig(input: ResolveApiConfigInput, envVarName: string): ApiConfig {
  const trimmedApiUrl = input.rawApiUrl?.trim();
  const trimmedSocketUrl = input.rawSocketUrl?.trim();

  if (trimmedApiUrl) {
    return {
      apiBaseUrl: trimmedApiUrl,
      socketUrl: trimmedSocketUrl || deriveSocketUrl(trimmedApiUrl),
      source: "env",
    };
  }

  if (input.isDev) {
    return {
      apiBaseUrl: DEFAULT_DEV_API_URL,
      socketUrl: trimmedSocketUrl || deriveSocketUrl(DEFAULT_DEV_API_URL),
      source: "dev-default",
    };
  }

  throw new MissingApiUrlError(envVarName);
}
