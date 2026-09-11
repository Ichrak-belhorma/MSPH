import { resolveApiConfig, looksInsecureForProduction, MissingApiUrlError, type ApiConfig } from "@msph/shared";

/**
 * The one place `EXPO_PUBLIC_API_BASE_URL`/`EXPO_PUBLIC_SOCKET_URL` are
 * read. `apiClient.ts`, `socket.ts`, and `photoUpload.ts` all call
 * `getApiBaseUrl()`/`getSocketUrl()` from here — never
 * `process.env.EXPO_PUBLIC_*` directly — so there is exactly one
 * URL-resolution policy in the app (`@msph/shared`'s `resolveApiConfig`,
 * see its doc comment for the full dev/production rule).
 *
 * Expo inlines every `EXPO_PUBLIC_*` env var into the JS bundle **at
 * build time** (Metro's `babel-preset-expo` does a static text
 * replacement of `process.env.EXPO_PUBLIC_X`, wherever it's referenced —
 * this file included) — see https://docs.expo.dev/guides/environment-variables/.
 * That means:
 *
 *   - `expo start` (dev): reads the shell's exported env vars, or an
 *     `apps/mobile/.env`/`.env.local` file (Expo's own convention, loaded
 *     automatically — no dotenv package needed).
 *   - `eas build`: reads the `env` block of the matching profile in
 *     `eas.json` (see that file) — NOT the developer's local shell, since
 *     EAS builds run on a remote builder that never sees it.
 *
 * `__DEV__` is a React Native global, `true` in a dev client / `expo
 * start` bundle and `false` in any build made with `--profile
 * preview`/`production` via EAS (or a plain `expo export`) — this is
 * what actually distinguishes "convenient localhost fallback is OK" from
 * "a missing URL is a build mistake", not `NODE_ENV` (which Metro sets
 * inconsistently across these paths).
 *
 * **This is the root-cause fix for "Server unreachable"** — see
 * CONTEXT.md session 7: the previous code read
 * `process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"`
 * completely unconditionally, dev or production. `localhost` on a phone
 * (physical device or emulator) means *the phone itself* — there was
 * never a server listening there, hence the error. No `.env` file existed
 * in `apps/mobile/` at all, so every dev run silently used that fallback
 * unless `EXPO_PUBLIC_API_BASE_URL` happened to be exported in the shell
 * first.
 */
function loadConfig(): ApiConfig {
  const config = resolveApiConfig(
    {
      rawApiUrl: process.env.EXPO_PUBLIC_API_BASE_URL,
      rawSocketUrl: process.env.EXPO_PUBLIC_SOCKET_URL,
      isDev: __DEV__,
    },
    "EXPO_PUBLIC_API_BASE_URL",
  );
  if (looksInsecureForProduction(config.apiBaseUrl, __DEV__)) {
    // Not fatal — see looksInsecureForProduction's doc comment — but
    // worth a loud warning wherever this build's logs end up.
    console.warn(`[config] EXPO_PUBLIC_API_BASE_URL="${config.apiBaseUrl}" is not HTTPS. A real production API must be served over HTTPS.`);
  }
  return config;
}

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

/** Exposed for `app/_layout.tsx`'s startup guard — checks for a
 * configuration error without throwing, so the app can render a clear
 * message instead of crashing or showing a misleading "Server
 * unreachable" once requests start failing. */
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

/** True when no `EXPO_PUBLIC_API_BASE_URL` was configured and the app
 * fell back to the hardcoded local dev default — used to show an
 * obvious "dev mode" banner (see `components/DevApiBanner.tsx`) so a
 * worker's real phone is never silently pointed at a dev default without
 * anyone noticing until it fails. */
export function isUsingDevDefaultApi(): boolean {
  return getConfig().source === "dev-default";
}
