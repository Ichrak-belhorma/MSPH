# MSPH

Internal field-service management system for a disinfection / pest-control
company: customer intake, case tracking, worker scheduling, on-site
inspections, treatments, follow-ups and resolution — shared in real time by
an office desktop app (managers) and a worker-facing mobile app (the field
team).

See [`CONTEXT.md`](./CONTEXT.md) for the full project memory — architecture
decisions, domain rules, and session-by-session build history. Read it
before starting new work; it is the source of truth for *why* things are
built the way they are, not just what exists.

## Architecture

```
                 ┌─────────────────┐
                 │   PostgreSQL     │
                 └────────▲─────────┘
                          │ Prisma
                 ┌────────┴─────────┐
                 │  apps/server      │  Express REST API + Socket.IO
                 │  (source of truth)│  JWT auth, Zod validation, file storage
                 └───▲──────────▲───┘
        HTTPS + WS   │          │   HTTPS + WS
            ┌────────┴───┐  ┌───┴─────────┐
            │ apps/desktop│  │ apps/mobile │
            │ (Electron)  │  │ (Expo RN)   │
            │ managers    │  │ field workers│
            └─────────────┘  └─────────────┘
```

- **apps/server** — Express + TypeScript + Prisma + PostgreSQL. The only
  thing that talks to the database. Owns authentication, authorization,
  validation, the case/visit state machine, the audit timeline, photo
  storage, and the Socket.IO realtime layer. Both clients are thin: neither
  holds business logic or a local database, every read/write is an
  authenticated HTTP call, and every screen refetches from the server after
  a realtime event rather than trusting the event's own payload.
- **apps/desktop** — Electron + React + Vite + `@tanstack/react-query`.
  Manager-facing operations dashboard: intake, scheduling, assigning
  workers, tracking every case to resolution. Refresh tokens are encrypted
  at rest via Electron's `safeStorage`.
- **apps/mobile** — Expo (React Native, file-based routing via Expo
  Router) + `@tanstack/react-query`. Worker-facing field tool: today's
  visits, start/complete a visit, record an inspection, capture and upload
  photos, record treatments performed. Optimized for fast one-handed use in
  the field, with local draft persistence so typed notes and captured
  photos survive a dropped connection or the app being backgrounded.
- **packages/shared** — Zod validation schemas, TypeScript types, domain
  enums and constants (including the Socket.IO event taxonomy) used by all
  three apps, so the wire contract between client and server is defined
  once. Deliberately locale-neutral (English); each client owns its own
  French UI copy in its own `lib/labels.ts`.

Realtime sync: the server emits a specific, narrow Socket.IO event per
action (e.g. `VISIT_STARTED`, `CASE_STATUS_CHANGED`, `PHOTO_ADDED` — see
`packages/shared/src/constants`), carrying only IDs. Clients treat every
event purely as "something changed, go refetch" and invalidate the
relevant `react-query` cache entries — the client's own authorized `GET` is
always what actually populates the UI. This keeps desktop and mobile in
sync across a manager and a worker acting on the same case at the same
time, without ever trusting an unauthenticated payload as data.

## Prerequisites

- Node.js >= 20
- pnpm (`corepack enable`, or install the version pinned in the root
  `package.json`'s `packageManager` field)
- PostgreSQL 14+ running locally (or reachable via `DATABASE_URL`)
- For mobile: the [Expo Go](https://expo.dev/go) app on a phone, or an
  iOS/Android simulator, to run on an actual device — `expo start --web`
  also works entirely in a browser for a fast inner loop without a device
- For desktop: no extra tooling — Electron ships with its own runtime

## Project structure

```
apps/
  server/    Express API — source of truth for all data
    src/
      config/       Environment loading + validation (fail fast on boot)
      lib/           JWT, password hashing, authorization helpers, logger
      middleware/     Auth, validation, rate limiting, error handling
      modules/        One folder per resource (auth, cases, visits, ...):
                       routes + service (business logic) + Prisma calls
      realtime/       Socket.IO server + typed emit helpers
      storage/        StorageDriver abstraction (local disk / S3-compatible)
      routes/         Route aggregation + health check
    prisma/           schema.prisma, migrations, seed script
    tests/            vitest + supertest integration tests (real HTTP + DB)
    Dockerfile        Multi-stage production image (see "Production deployment")
  desktop/   Electron + React manager app
    src/
      config.ts        Single source of truth for VITE_API_BASE_URL/SOCKET_URL
      pages/          One folder per section (cases, customers, workers, ...)
      api/            Typed query/mutation hooks per resource
      auth/            AuthContext, route guard
      realtime/        RealtimeProvider — Socket.IO -> cache invalidation
      lib/             API client, secure token storage, query client
      electron/        Main + preload processes (safeStorage-backed token vault)
    electron-builder.yml   Windows/macOS/Linux installer packaging config
  mobile/    Expo + React Native worker app
    app/              File-based routes (Expo Router): index, login,
                       case/[id], visit/[id]/{index,inspection,photos,complete,...}
    api/              Typed query/mutation hooks per resource
    auth/              AuthContext, route guard
    realtime/          RealtimeProvider — Socket.IO -> cache invalidation
    lib/
      config.ts        Single source of truth for EXPO_PUBLIC_API_BASE_URL/SOCKET_URL
      (API client, secure token storage, draft persistence, photo upload)
    components/        Shared UI primitives (BigButton, Card, EmptyState, ...)
    eas.json          EAS Build profiles (development/preview/production)
packages/
  shared/    Zod schemas, TS types, enums, Socket.IO event constants,
             config/ (shared dev-vs-production API URL resolution policy)
.github/workflows/    CI: backend tests, desktop installer build, mobile EAS build
```

The desktop and mobile apps hold no business logic or local database —
every read/write goes through the server's HTTP API, and every realtime
event is a prompt to refetch, never a data transport.

## Environment variables

### Server (`apps/server/.env` — copy from the repo root's `.env.example`)

| Variable | Default | Notes |
|---|---|---|
| `NODE_ENV` | `development` | `development` \| `test` \| `production` |
| `PORT` | `4000` | HTTP port |
| `CLIENT_ORIGIN` | `http://localhost:5173` | Comma-separated list of allowed browser origins (CORS). Add the mobile app's web origin (`http://localhost:8081`) if you run `expo start --web`. Native mobile `fetch` sends no `Origin` header and is unaffected. |
| `DATABASE_URL` | — (required) | PostgreSQL connection string |
| `JWT_ACCESS_SECRET` | — (required, ≥16 chars) | Signs short-lived access tokens. Generate with `openssl rand -hex 32` for anything beyond local dev. |
| `JWT_REFRESH_SECRET` | — (required, ≥16 chars) | Signs refresh tokens (rotated on every use, reuse triggers a full session revoke). Must differ from the access secret. |
| `JWT_ACCESS_TTL` | `15m` | Access token lifetime |
| `JWT_REFRESH_TTL` | `30d` | Refresh token lifetime |
| `STORAGE_DRIVER` | `local` | `local` (dev) or `s3` (production — any S3-compatible provider, see below) |
| `STORAGE_LOCAL_ROOT` | `./storage/uploads` | Where uploaded photos are written on disk |
| `STORAGE_PUBLIC_URL` | `http://localhost:4000/uploads` | Base URL the API returns for a stored photo |

The server validates all of this with Zod at boot (`src/config/env.ts`) and
refuses to start rather than run with a missing/invalid value.

Production-only, only read when `STORAGE_DRIVER=s3` (any S3-compatible
store — AWS S3, Cloudflare R2, Backblaze B2, Supabase Storage, MinIO — see
`src/storage/s3StorageDriver.ts`); the server refuses to start with a
clear error naming what's missing if you set `STORAGE_DRIVER=s3` without
these:

| Variable | Notes |
|---|---|
| `STORAGE_BUCKET` | Required |
| `STORAGE_REGION` | `auto` works for R2; set a real AWS region for S3 |
| `STORAGE_ENDPOINT` | Required for R2/B2/MinIO; omit for real AWS S3 |
| `STORAGE_ACCESS_KEY` | Required |
| `STORAGE_SECRET_KEY` | Required |
| `STORAGE_FORCE_PATH_STYLE` | `true` for R2/MinIO, `false` (default) for AWS S3 |
| `STORAGE_PUBLIC_URL_BASE` | Optional — a CDN/custom domain fronting the bucket; omit to serve directly from the bucket/endpoint URL |

### Desktop (`apps/desktop/.env` for dev, `.env.production` for a real build — Vite `VITE_` prefix)

Read once, centrally, by `src/config.ts` — no other file reads
`import.meta.env.VITE_*` directly. See `.env.example` /
`.env.production.example` in `apps/desktop/`.

| Variable | Dev default | Production |
|---|---|---|
| `VITE_API_BASE_URL` | `http://localhost:4000/api` (only in a dev build — `import.meta.env.DEV`) | **Required.** A production build (`vite build`, what `pnpm --filter @msph/desktop dist` runs) with this unset shows a clear "Erreur de configuration" screen instead of silently trying localhost. |
| `VITE_SOCKET_URL` | derived from `VITE_API_BASE_URL` (strips `/api`) | same |

### Mobile (`apps/mobile/.env` for dev — Expo `EXPO_PUBLIC_` prefix; `eas.json`'s per-profile `env` for real builds)

Read once, centrally, by `lib/config.ts` — no other file reads
`process.env.EXPO_PUBLIC_*` directly. See `.env.example` in
`apps/mobile/`.

| Variable | Dev default | Production |
|---|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | `http://localhost:4000/api` (only in a dev build — RN's `__DEV__`) | **Required** in `eas.json`'s `preview`/`production` build profiles. A production build with this unset shows a clear configuration-error screen instead of silently trying localhost. |
| `EXPO_PUBLIC_SOCKET_URL` | derived from `EXPO_PUBLIC_API_BASE_URL` (strips `/api`) | same |

`localhost` only resolves to "this machine" — on a physical phone, an
Android emulator, or a packaged desktop build, it means *that device
itself*. This is exactly last session's "Server unreachable" bug (see
`CONTEXT.md` session 7) — point dev builds at your machine's LAN IP
instead (e.g. `http://192.168.1.20:4000/api`), and real builds at your
deployed API's real HTTPS domain. Both apps show an on-screen "MODE DÉV"
indicator whenever they've fallen back to the localhost dev default, so
it's never mistaken for a working connection.

## Database setup & migrations

```bash
pnpm install

# 1. Configure the server (.env.example lives at the repo root and
#    documents every variable the server reads — see the table below)
cp .env.example apps/server/.env
# edit apps/server/.env — at minimum DATABASE_URL and the two JWT secrets

# 2. Create the schema
pnpm --filter @msph/server prisma:migrate      # dev: creates/updates msph_dev + generates the client

# 3. Seed sample data (idempotent — upserts by email/id)
pnpm --filter @msph/server prisma:seed
```

Other Prisma commands you'll use during development:

```bash
pnpm --filter @msph/server prisma:studio       # browse/edit the database in a GUI
pnpm --filter @msph/server prisma:generate      # regenerate the Prisma client after a schema change
pnpm --filter @msph/server prisma:deploy        # apply committed migrations without prompting (CI/prod)
```

New migration after editing `prisma/schema.prisma`:

```bash
pnpm --filter @msph/server exec prisma migrate dev --name <describe_the_change>
```

Tests run against a **separate** database so `pnpm test` never touches your
dev data:

```bash
createdb -O msph msph_test   # or: psql -c "CREATE DATABASE msph_test OWNER msph;"
DATABASE_URL="postgresql://msph:msph_dev_password@localhost:5432/msph_test?schema=public" \
  pnpm --filter @msph/server exec prisma migrate deploy
```

## Running the apps

```bash
pnpm dev:server     # Express API on http://localhost:4000 (health check: GET /api/health)
pnpm dev:desktop    # Electron app (Vite dev server + Electron window together)
pnpm dev:mobile     # Expo dev server — scan the QR code with Expo Go, or press a/i/w
```

`pnpm dev` runs the server and desktop together. Run mobile in its own
terminal — Expo's interactive CLI doesn't multiplex well alongside the
others.

### Default dev logins

Seeded by `prisma:seed` (`apps/server/prisma/seed.ts`), password
`ChangeMe123!` for both:

- `admin@msph.local` — ADMIN (desktop: full access)
- `worker@msph.local` — WORKER (mobile: sees only their assigned visits/cases)

## Testing

```bash
pnpm --filter @msph/server test          # backend integration suite (vitest + supertest)
pnpm --filter @msph/server test:watch    # watch mode
```

The suite runs the real Express app and Prisma against `msph_test` (see
Database setup above) — no mocked HTTP layer, no mocked database. It
covers the happy path end-to-end (intake → consultation → scheduling →
worker assignment → inspection → treatment → resolution), the realtime
event contract (a dedicated test boots a real HTTP + Socket.IO server and
asserts the exact event fired at each step), and failure paths: wrong
password / deactivated account, expired or reused refresh tokens, a worker
reading or acting on another worker's case/visit (403, not a leaked 404),
malformed request bodies, scheduling on a resolved/cancelled case,
duplicate visit completion (network retry / double-tap — must be a safe
no-op, not a re-run of the whole workflow), and non-existent record IDs.

There is currently no dedicated test runner configured for the desktop or
mobile apps (no ESLint/Prettier either, across the whole repo) — see
`CONTEXT.md` "Technical debt" for the state of this and what's been
verified manually instead.

## CI/CD

`.github/workflows/`:

- **`backend.yml`** — runs on every push/PR touching the server or shared
  package: typecheck, the full test suite against a real Postgres service
  container, and a production build. No deploy step — connect the repo to
  your hosting platform's own auto-deploy-on-push (Railway/Render/
  Fly.io all support this from their dashboard).
- **`desktop.yml`** — manual (`workflow_dispatch`) or on a `desktop-v*`
  tag: builds the Windows NSIS installer on a real `windows-latest`
  runner and uploads it as a build artifact.
- **`mobile.yml`** — manual only (EAS builds consume build-minutes, so
  this is deliberately not automatic): triggers a real EAS build for the
  chosen profile/platform. Needs an `EXPO_TOKEN` repository secret (see
  the workflow file's own comment for how to generate one).

## Other useful commands

```bash
pnpm typecheck   # typecheck every package (shared, server, desktop, mobile)
pnpm build       # build shared + server for production
```

## Production deployment

Three independently deployable pieces, all pointed at the same backend —
see `CONTEXT.md` "Production deployment architecture" (session 7) for the
full write-up, including exactly what was verified by actually running
these steps versus what still needs a real account/server to finish.

### Backend

```bash
# Build the production Docker image (context = repo root, not apps/server/)
docker build -f apps/server/Dockerfile -t msph-server .

# Run it — needs DATABASE_URL, JWT_*, CLIENT_ORIGIN at minimum (see
# .env.example); applies pending Prisma migrations on every start
# (safe/idempotent — see the Dockerfile's own comment) then starts the API.
docker run --rm -p 4000:4000 --env-file apps/server/.env.production msph-server
```

No cloud provider is hard-coded — the image is a plain Node process
listening on `$PORT` behind whatever reverse proxy terminates TLS, so it
runs unmodified on Railway, Render, Fly.io, a plain VPS + Nginx, or AWS/
DigitalOcean's container services. Whichever you pick:

1. Provision a managed PostgreSQL instance (or point `DATABASE_URL` at
   your own) and set it as an env var on the platform.
2. Set `JWT_ACCESS_SECRET`/`JWT_REFRESH_SECRET` to real random values
   (`openssl rand -hex 32`) — never the dev placeholders.
3. Set `CLIENT_ORIGIN` to your real desktop/web origins (see "CORS" in
   `.env.example` — never `*`).
4. Point the platform's health check at `GET /api/health` (checks DB
   connectivity too, without leaking any secret — see its response
   shape in `apps/server/src/routes/health.routes.ts`).
5. Choose file storage: `STORAGE_DRIVER=local` only survives on a
   platform with a persistent volume mounted at `STORAGE_LOCAL_ROOT`,
   and only with exactly one instance — `STORAGE_DRIVER=s3` (any
   S3-compatible provider, see the env var table above) is what a real
   multi-instance/redeployed-often production setup should use.
6. `CLIENT_ORIGIN` needs your platform's actual public HTTPS URL once
   you know it — nothing here is pre-filled with a guessed domain.

### Object/file storage

`apps/server/src/storage/` is a small interface (`StorageDriver`) with
two implementations: `localStorageDriver.ts` (dev — writes to disk) and
`s3StorageDriver.ts` (production — any S3-compatible provider: AWS S3,
Cloudflare R2, Backblaze B2, Supabase Storage, self-hosted MinIO). Switch
with `STORAGE_DRIVER=s3` and the `STORAGE_*` vars documented above — the
server validates them at boot and refuses to start with a clear error if
any are missing, rather than failing the first time a worker uploads a
photo.

### Desktop — Windows installer

```bash
pnpm desktop:build        # renderer + Electron main/preload compile
pnpm desktop:dist:win     # + packages a Windows NSIS installer (electron-builder)
```

Produces `apps/desktop/release/MSPH Setup <version>.exe` — an installer a
user downloads and runs, with no Node.js, no npm, and no copy of this
repository required on their machine (Electron bundles its own runtime;
`apps/desktop/electron-builder.yml` ships only the compiled `dist/` +
`dist-electron/` output as an `asar` archive, not the source tree or
`node_modules`). Before building for real distribution:

1. Copy `apps/desktop/.env.production.example` to `.env.production` and
   set `VITE_API_BASE_URL` to your real deployed API's HTTPS URL — this
   is baked into the installer at build time; there's no way to change it
   after the fact without rebuilding.
2. NSIS installer builds only work natively on Windows (or via Wine on
   Linux/macOS, not set up here) — `.github/workflows/desktop.yml` builds
   it on a real `windows-latest` GitHub Actions runner instead;
   `pnpm desktop:dist` (no `:win`) on this machine still validates the
   packaging step itself using the current OS's target.
3. **Windows code signing is not configured.** An unsigned installer
   triggers a Windows SmartScreen "Unknown publisher" warning — expected,
   not a bug, and fine for internal-only distribution. Before a real
   public release: buy a code-signing certificate (an EV cert from a CA
   like DigiCert/SSL.com avoids the SmartScreen reputation-building
   period a cheaper OV cert needs), then add `win.certificateFile`/
   `certificatePassword` (or `CSC_LINK`/`CSC_KEY_PASSWORD` env vars) to
   `electron-builder.yml` — see [electron-builder's code signing
   docs](https://www.electron.build/code-signing).
4. No custom app icon is committed yet — see
   `apps/desktop/build/README.md`.

### Mobile — Android & iOS (EAS)

This project uses Expo, so [EAS Build](https://docs.expo.dev/build/introduction/)
(Expo's managed cloud build service) is the path — it needs a free Expo
account (`eas login`), which this session had no credentials for, so the
steps below are documented but not executed end-to-end:

```bash
npx eas-cli login                       # one-time, needs a real Expo account
npx eas-cli build:configure             # links this project to your EAS project id
pnpm mobile:build:preview               # internal-testing APK (eas.json "preview" profile)
pnpm mobile:build:production            # store-ready build (eas.json "production" profile)
```

`apps/mobile/eas.json` has three profiles (`development`/`preview`/
`production`) and `apps/mobile/app.json` has real `android.package` /
`ios.bundleIdentifier` (`com.msph.mobile`) already set. Before a real
build:

1. Edit `eas.json`'s `preview`/`production` profiles' `EXPO_PUBLIC_API_BASE_URL`
   from the placeholder to your real deployed API's HTTPS URL (committing
   this is fine — it's a public URL, not a secret).
2. `preview` builds an installable `.apk` for direct/internal testing;
   `production` builds an `.aab` (Android App Bundle) for Google Play and
   an iOS build for TestFlight/App Store submission.
3. **iOS needs a paid Apple Developer Program account** ($99/year) for
   any real device build beyond a simulator, and for App Store/TestFlight
   submission — EAS walks you through generating/uploading the needed
   certificates interactively on first build (`eas credentials`), no
   secret is committed to this repo.
4. Android needs a signing keystore — EAS generates and manages one for
   you by default (stored on Expo's servers, associated with your
   account), or you can supply your own via `eas credentials`.
5. `apps/mobile/app.json` already has an icon/splash/adaptive-icon
   configured (session 1's placeholder assets) — swap in the company's
   real logo there before a public release.

## Production readiness checklist

What was actually verified by running it this session (not just "it
compiles") versus what still needs a real account/server this sandbox
doesn't have — see `CONTEXT.md` session 7 for the full detail behind each
line.

- [x] Backend builds (`tsc -b`, clean)
- [x] Backend starts (live boot verified)
- [x] Database connects (`/api/health` → `"database":"connected"`, live)
- [x] Prisma migrations run cleanly against a brand-new empty database (live)
- [x] `GET /api/health` works and leaks no secrets (live)
- [x] CORS configured correctly, including the packaged-Electron `null`
      origin case (live: allowed/null/rejected origins all verified)
- [x] Trust proxy configured for accurate `req.ip` behind a reverse proxy
      (so the login rate limiter keys on the real client, not the proxy)
- [x] Graceful shutdown drains Socket.IO + HTTP connections before exit
      (live: SIGTERM verified)
- [x] Authentication works (45/45 automated integration tests, real DB)
- [x] Desktop production build + packaging works (live: built, packaged
      with electron-builder, launched without crashing)
- [x] Desktop uses the shared production API config, fails loudly (not
      silently to localhost) when unconfigured (live-verified)
- [x] Mobile production-mode bundle works and uses the shared config
      (live: `expo export` in production mode correctly shows the
      config-error screen when unconfigured)
- [x] Socket.IO URL derives from the same config as the REST API on both
      clients (code path unified this session; realtime contract itself
      unchanged/still covered by `realtime.test.ts`)
- [x] Photo upload: S3-compatible storage driver added, boots correctly
      with credentials present (live), local driver unchanged/still works
- [x] Error handling: CORS rejections, validation, auth, upload errors all
      map to clean JSON responses, never an unhandled 500 (live-verified
      for CORS specifically this session)
- [x] Every environment variable documented (`.env.example` at repo root,
      `apps/desktop/.env*.example`, `apps/mobile/.env.example`, `eas.json`)
- [x] Secrets excluded from git (`.gitignore` audited/expanded this
      session; repo-wide scan found no committed secrets)
- [ ] **Windows installer**: config written and packaging validated on
      this machine (non-Windows target), but the actual `.exe` via NSIS
      needs a real Windows/Wine build — wired in
      `.github/workflows/desktop.yml`, not yet run on a real GitHub
      Actions runner
- [ ] **Android build**: `app.json`/`eas.json` configured; an actual EAS
      build needs a real Expo account this session doesn't have
- [ ] **iOS build**: `app.json`/`eas.json` configured; an actual EAS build
      needs a real Expo account **and** a paid Apple Developer account
- [ ] **HTTPS**: the server is TLS-termination-ready (trust proxy set),
      but no real reverse proxy/TLS certificate exists to test against in
      this sandbox — verify against your actual deployed domain
- [ ] **S3/R2 storage against a real bucket**: driver code verified to
      boot correctly with credentials present; no real bucket was
      available to upload an actual file to and confirm end-to-end
- [ ] **Code signing** (Windows + Apple): deliberately not set up — see
      "Desktop — Windows installer" above for exactly what's needed

## Backend API

The full REST surface (auth, users, customers, landlords, properties,
cases, visits, inspections, photos, treatments) plus the authorization
model and Socket.IO event taxonomy are documented in `CONTEXT.md` — see
"Backend API", "Authorization model", and "Realtime design".
