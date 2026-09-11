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
      storage/        StorageDriver abstraction (local disk today)
      routes/         Route aggregation + health check
    prisma/           schema.prisma, migrations, seed script
    tests/            vitest + supertest integration tests (real HTTP + DB)
  desktop/   Electron + React manager app
    src/
      pages/          One folder per section (cases, customers, workers, ...)
      api/            Typed query/mutation hooks per resource
      auth/            AuthContext, route guard
      realtime/        RealtimeProvider — Socket.IO -> cache invalidation
      lib/             API client, secure token storage, query client
      electron/        Main + preload processes (safeStorage-backed token vault)
  mobile/    Expo + React Native worker app
    app/              File-based routes (Expo Router): index, login,
                       case/[id], visit/[id]/{index,inspection,photos,complete,...}
    api/              Typed query/mutation hooks per resource
    auth/              AuthContext, route guard
    realtime/          RealtimeProvider — Socket.IO -> cache invalidation
    lib/               API client, secure token storage, draft persistence,
                        photo upload
    components/        Shared UI primitives (BigButton, Card, EmptyState, ...)
packages/
  shared/    Zod schemas, TS types, enums, Socket.IO event constants
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
| `STORAGE_DRIVER` | `local` | Only `local` exists today; the `StorageDriver` interface (`src/storage`) is the seam for adding S3/R2 later |
| `STORAGE_LOCAL_ROOT` | `./storage/uploads` | Where uploaded photos are written on disk |
| `STORAGE_PUBLIC_URL` | `http://localhost:4000/uploads` | Base URL the API returns for a stored photo |

The server validates all of this with Zod at boot (`src/config/env.ts`) and
refuses to start rather than run with a missing/invalid value.

### Desktop (`apps/desktop/.env`, optional — Vite `VITE_` prefix)

| Variable | Default |
|---|---|
| `VITE_API_BASE_URL` | `http://localhost:4000/api` |
| `VITE_SOCKET_URL` | derived from `VITE_API_BASE_URL` (strips `/api`) |

### Mobile (`apps/mobile/.env`, optional — Expo `EXPO_PUBLIC_` prefix)

| Variable | Default |
|---|---|
| `EXPO_PUBLIC_API_BASE_URL` | `http://localhost:4000/api` |
| `EXPO_PUBLIC_SOCKET_URL` | derived from `EXPO_PUBLIC_API_BASE_URL` (strips `/api`) |

`localhost` only resolves to "this machine" — on a physical phone or a
simulator that isn't sharing the host's network stack, point these at your
machine's LAN IP instead (e.g. `http://192.168.1.20:4000/api`).

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

## Other useful commands

```bash
pnpm typecheck   # typecheck every package (shared, server, desktop, mobile)
pnpm build       # build shared + server for production
```

## Production notes

- `apps/server`: `pnpm --filter @msph/server build && pnpm --filter @msph/server start`
  after setting real secrets and running `prisma:deploy`. `STORAGE_DRIVER=local`
  is fine for a single instance; swap in an S3/R2-backed `StorageDriver`
  before scaling out (see `apps/server/src/storage/StorageDriver.ts`).
- `apps/desktop`: `pnpm --filter @msph/desktop build` produces a packaged
  Electron app (not yet wired to an installer/auto-update pipeline).
- `apps/mobile`: build with EAS (`eas build`) per Expo's own docs; not set
  up in this repo yet.

## Backend API

The full REST surface (auth, users, customers, landlords, properties,
cases, visits, inspections, photos, treatments) plus the authorization
model and Socket.IO event taxonomy are documented in `CONTEXT.md` — see
"Backend API", "Authorization model", and "Realtime design".
