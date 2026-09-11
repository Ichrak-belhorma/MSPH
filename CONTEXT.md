# CONTEXT.md — MSPH Project Memory

**Read this file completely at the start of every session.** It is the
persistent memory of the project. Do not redo completed work — check
"Current status" and "Next steps" first and continue from there.

Last updated: 2026-09-11 (session 1 — initial foundation build).

---

## 1. Product summary

MSPH is an internal, operational field-service application for a company
that does disinfection and pest/nuisance removal in residential properties.
It is **not a generic CRM** — every screen exists to answer a specific
operational question (what's new, what's scheduled, what am I doing today).

Core workflow: a customer reports a problem (currently via email, manually
transcribed by a manager) → an inspection visit is scheduled → a worker
inspects the property and records observations/photos → the company
chooses treatment(s) → treatment + follow-up visits happen → case is
marked resolved.

Full product/domain spec as given by the project owner is preserved in the
original task description that started this project (not duplicated here
in full — this file records decisions and current state, not the brief).

## 2. Platforms & tech stack (as specified, all in place)

- **apps/server** — Node.js + Express + TypeScript, Prisma ORM, PostgreSQL,
  Socket.IO, Zod validation, JWT (access+refresh) planned, Argon2 for
  password hashing (dependency installed, not wired into routes yet).
- **apps/desktop** — Electron + React + TypeScript + Vite. Manager/admin app.
- **apps/mobile** — Expo (SDK 57) + React Native + TypeScript, using
  **Expo Router** (file-based routing) for navigation. Worker field app.
- **packages/shared** — domain types, Zod schemas, enums, constants. Both
  apps and the server import from `@msph/shared`; nothing is duplicated.
- **Package manager**: pnpm workspaces (`pnpm-workspace.yaml`). Pinned via
  `packageManager` in root `package.json` — currently `pnpm@10.34.5`
  (10.9.7, a plausible-looking version at the time this was written, no
  longer resolves on the registry — if `pnpm install` ever fails with
  `ERR_PNPM_NO_MATCHING_VERSION`, bump this field to whatever `pnpm
  --version` reports on the machine and re-run).

The desktop and mobile apps have **no local database and no duplicated
business logic** — everything goes through the Express API. This was
followed strictly in this session (see `apps/desktop/src/lib/api.ts` and
`apps/mobile/lib/api.ts` — both are thin fetch wrappers, nothing else).

## 3. Domain decisions (deviations from the literal brief, and why)

The brief said "do not blindly implement [the suggested statuses] if a
better model fits — document the decision here." Decisions made:

### 3.1 Case.status is 5 states, not 8

Brief suggested: NEW / SCHEDULED / INSPECTION_COMPLETED / TREATMENT_PLANNED
/ FOLLOW_UP_SCHEDULED / IN_PROGRESS / RESOLVED / CANCELLED (implies a
linear progression).

**Decision**: `Case.status` is `NEW | SCHEDULED | IN_PROGRESS | RESOLVED |
CANCELLED` (see `packages/shared/src/enums.ts`, heavily commented).

**Why**: a case is not linear — it can loop through several
inspection/treatment/follow-up visits before resolution (e.g. treatment →
follow-up → treatment again → follow-up → resolved). A single field with
one value per linear stage can't represent "on the 2nd follow-up" without
either adding more enum values forever or reusing existing ones
incorrectly. Instead, the fine-grained stage lives on the **visit history**
(`Visit` rows, ordered by `scheduledAt`/`completedAt`), which naturally
supports any number of loops. `Case.status` stays a coarse bucket good
enough for Kanban-style dashboard columns.

**Consequence for the dashboard**: "which consultations are scheduled",
"which interventions are upcoming", "which cases are waiting for
follow-up" are **not** `Case.status` filters — they're queries against
`Visit` (by `type` + `scheduledAt` + `status`). This is not yet
implemented (no cases/visits API exists yet — see Next steps) but the
schema supports it and `apps/desktop/src/pages/DashboardPage.tsx` has a
comment explaining this so nobody "fixes" it into a status filter later.

### 3.2 User roles: ADMIN + WORKER (not ADMIN, OWNER, WORKER)

Brief listed roles as "ADMIN / OWNER" and "WORKER" — read as one admin-tier
role written with a slash, not two separate roles. Implemented as a single
`ADMIN` role plus `WORKER`. If the business later needs an owner tier with
narrower admin permissions removed (billing-only access, etc.), add an
`OWNER` value to the `UserRole` enum then — nothing here assumes exactly
two roles beyond the enum itself.

### 3.3 Property has no direct `customerId`

`Property` links to `Landlord` (the owner, stable over time) but not
directly to `Customer`. The customer relationship is per-`Case`
(`Case.customerId` + `Case.propertyId`). This models rental turnover
correctly: the landlord owns the property regardless of who currently
lives there; the tenant/customer reporting an issue can change between
cases at the same property.

### 3.4 Visit/Inspection split, and `condition` is free text

`Visit` is the schedulable event (has a worker, a time, a type, a status).
`Inspection` is the on-site record a worker fills in when completing a
visit (observations, remarks, condition) — one-to-one with `Visit`,
created on completion. `condition` is a free-text field, not an enum —
pest/property conditions vary too widely to enumerate usefully for v1.

### 3.5 Added `CaseTreatment.status` (PLANNED/COMPLETED/CANCELLED)

Not explicitly in the brief's field list for `CaseTreatment`, but needed:
"the company chooses a treatment" (planned) happens before "the treatment
was performed" (completed) — these are two different moments in time and
the UI needs to distinguish "planned, not done yet" from "done".

### 3.6 IDs are `cuid()`, not auto-increment integers

Standard Prisma choice for a system where IDs may eventually be created
client-side or need to be non-guessable (photo URLs, etc.). No strong
reason to deviate; consistent across all models.

## 4. Realtime design (Socket.IO) — intentionally minimal so far

Per the "don't over-engineer realtime yet" instruction, only the transport
skeleton exists (`apps/server/src/realtime/socket.ts`): a Socket.IO server
attached to the same HTTP server as Express, with `case:join` / `case:leave`
room handlers. **No domain events are emitted yet** — nothing calls
`getIO().to(...).emit(...)` anywhere. The event *names* are already fixed
in `packages/shared/src/constants/index.ts` (`SOCKET_EVENTS`) so both
client apps can start listening for them before the server emits them:

- `case:created`, `case:updated` — broadcast to a global `cases` room
  (not yet joined by anything — needs a "join cases room on dashboard
  mount" convention once the dashboard is real).
- `visit:created`, `visit:updated` — broadcast to `case:${caseId}` rooms
  only, so clients don't receive updates for cases they're not looking at.

**Why this shape**: broadcasting every mutation to every client doesn't
scale and isn't necessary — a desktop dashboard cares about *any* case
changing (so it can refresh a list/count), but a case detail screen only
cares about *its* case. Deliberately not building more than this until
the routes that would emit these events exist.

## 5. File storage — abstraction not yet built

`STORAGE_DRIVER=local` is defined in env config
(`apps/server/src/config/env.ts`) and the Express app already serves
`/uploads` as static files from `STORAGE_LOCAL_ROOT`
(`apps/server/storage/uploads/`, gitignored except `.gitkeep`). **No
storage interface/driver code exists yet** — no photo upload route, no
`src/storage/` module. When building it: define a small
`StorageDriver` interface (`put(key, stream) -> {key, url}`, `getUrl(key)`,
maybe `delete(key)`) with a `LocalStorageDriver` implementation now and
leave room for `S3StorageDriver`/`R2StorageDriver` later, selected by
`STORAGE_DRIVER` at boot. `Photo.storageKey` + `Photo.url` in the schema
already anticipate this.

## 6. Auth — not implemented yet, deliberately

Dependencies are installed (`jsonwebtoken`, `argon2`) and env vars are
defined (`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, TTLs) and validated at
boot. Zod schemas for login/refresh/change-password exist in
`packages/shared/src/validation/auth.ts`. The `RefreshToken` Prisma model
(stores a hash, not the raw token) is in the schema. **But there is no
`/api/auth` route, no JWT middleware, no password verification code.**
Mobile's login screen (`apps/mobile/app/login.tsx`) is a UI-only stub that
navigates straight into the app. This was a deliberate scope cut for this
session ("don't over-engineer auth yet — foundation first").

## 7. What's built (this session — session 1)

### Root
- `package.json` (pnpm workspace root, scripts), `pnpm-workspace.yaml`,
  `tsconfig.base.json` (shared strict TS config), `.gitignore`,
  `.editorconfig`, `.env.example` (documents every server env var),
  `README.md`.

### packages/shared
- `src/enums.ts` — all domain enums (see section 3).
- `src/types/entities.ts` — API-facing entity interfaces (ISO date strings,
  mirrors Prisma models field-for-field) + `CaseWithRelations`.
- `src/types/api.ts` — `ApiErrorBody`, `AuthTokens`, `LoginResponse`,
  `HealthCheckResponse`.
- `src/validation/*.ts` — Zod schemas: `common` (shared primitives —
  required/optional string, email, phone, pagination), `auth`, `people`
  (customer/landlord/property/user update + create-user schemas), `case`
  (the manual intake workflow — `createCaseSchema` nests
  customer/property/landlord creation in one call, matching the product
  brief's step-by-step intake), `visit`, `treatment`, `photo`.
- `src/constants/index.ts` — UI labels for every enum, `SOCKET_EVENTS`,
  `DEFAULT_PAGE_SIZE`, `TERMINAL_CASE_STATUSES`.
- Builds with `tsc -b` to `dist/` (ESM, `.js` extensions on all relative
  imports — required for both `moduleResolution: Bundler` (desktop/vite)
  and `NodeNext` (server) to resolve it correctly).

### apps/server
- `prisma/schema.prisma` — full domain model: `User`, `RefreshToken`,
  `Customer`, `Landlord`, `Property`, `Case`, `Visit`, `Inspection`,
  `Photo`, `Treatment`, `CaseTreatment`, all enums. Migrated and applied
  (see section 8).
- `prisma/seed.ts` — upserts one admin user (`admin@msph.local` /
  `ChangeMe123!`, Argon2-hashed) and two starter treatments.
- `src/config/env.ts` — Zod-validated env loading, fails fast on boot with
  readable errors if misconfigured.
- `src/lib/prisma.ts` — singleton Prisma Client (survives `tsx watch`
  hot-reload via `globalThis`).
- `src/lib/logger.ts` — minimal structured JSON console logger.
- `src/middleware/errorHandler.ts` — `ApiError` class (`.notFound()`,
  `.badRequest()`, etc. factories), central `errorHandler` that also
  turns `ZodError`s into a field-level `{error:{code,message,details}}`
  body, `notFoundHandler` for unmatched routes.
- `src/middleware/validate.ts` — `validateBody`/`validateQuery` helpers
  (parse-and-replace `req.body`/`req.query` against a Zod schema).
- `src/routes/health.routes.ts` + `src/routes/index.ts` — `GET
  /api/health` checks real DB connectivity via `SELECT 1`.
- `src/realtime/socket.ts` — Socket.IO skeleton (see section 4).
- `src/app.ts` — Express app: helmet, cors (locked to `CLIENT_ORIGIN`),
  json/urlencoded body parsing, morgan logging, static `/uploads`,
  `/api` router mount, 404 + error handlers.
- `src/index.ts` — boots HTTP server + Socket.IO, graceful shutdown on
  SIGINT/SIGTERM.
- `.env` (gitignored, real dev values) and `.env.example`-equivalent
  content is in the root `.env.example` — **server reads its `.env` from
  `apps/server/.env`**, not the root file; the root one is documentation
  you copy from.

### apps/desktop
- Electron main process: `electron/main.cts` + `electron/preload.cts`
  (⚠️ **must stay `.cts`/emit `.cjs`** — see section 9.1 for why).
  Compiled by a separate `tsconfig.electron.json` (CommonJS) to
  `dist-electron/`.
- Vite + React renderer: `src/main.tsx`, `src/App.tsx` (HashRouter — plain
  BrowserRouter can't resolve nested paths under `file://` in a packaged
  app), `src/components/AppShell.tsx` (sidebar nav), `src/lib/api.ts`
  (fetch wrapper, mirrors mobile's), `src/styles/global.css`.
- Pages (all placeholders except Dashboard, which does a real health-check
  round trip): `DashboardPage`, `CasesPage`, `CalendarPage`,
  `CustomersPage`, `PropertiesPage`, `LandlordsPage`, `WorkersPage`,
  `TreatmentsPage`, `SettingsPage` — in `src/pages/`.
- Nav covers every top-level section named in the brief (Dashboard, Cases,
  Calendar, Customers, Properties, Landlords, Workers, Treatments,
  Settings).

### apps/mobile
- Generated from Expo's official `tabs` template (`create-expo-app
  --template tabs`, Expo SDK 57, React 19, RN 0.86, Expo Router with
  typed routes) and then customized — this was much more reliable than
  hand-rolling Metro/Babel config from scratch, and is the officially
  supported Expo project shape.
- Routes (`app/` — file-based, Expo Router):
  - `(tabs)/index.tsx` — **Today** (today's visits; placeholder empty
    state + live `ConnectionBanner` health check).
  - `(tabs)/upcoming.tsx` — **Upcoming** visits placeholder.
  - `(tabs)/profile.tsx` — worker profile placeholder, links to login.
  - `login.tsx` — UI-only login stub (see section 6).
  - `visit/[id].tsx` — visit detail placeholder with the action buttons
    the brief calls for (start visit / take photo / add remark / complete
    visit) — not wired to anything yet.
  - `+not-found.tsx` — kept from the template.
- `lib/api.ts` — fetch wrapper (same contract as desktop's). Reads
  `EXPO_PUBLIC_API_BASE_URL` — **must be a LAN IP, not `localhost`, when
  testing on a physical device via Expo Go** (documented in the file).
- `components/ConnectionBanner.tsx` — reusable health-check banner.
- `constants/Colors.ts` — retinted to the same teal (`#0f6e5c`) as the
  desktop app's `--color-primary`, light+dark variants.
- `app.json` — renamed to MSPH, added `expo-image-picker` plugin +
  Android `CAMERA` permission (needed once photo capture is built) and a
  camera-usage description string.

## 8. Current status — verified working end-to-end (session 1)

All of the following were actually run and confirmed, not assumed:

- `pnpm install` at root installs all 5 workspace packages.
- `pnpm approve-builds --all` was run once (needed for `argon2`, `electron`,
  `@prisma/client`/`@prisma/engines`, `prisma`, `esbuild` native
  postinstall scripts) — the choice is now recorded in
  `pnpm-workspace.yaml`'s `allowBuilds` block, so a fresh `pnpm install`
  on this machine won't prompt again.
- `pnpm --filter @msph/shared build` — clean.
- `pnpm -r typecheck` (shared, server, desktop, mobile) — all clean, run
  from repo root.
- PostgreSQL 16 running locally in this dev container; created role
  `msph`/`msph_dev_password` and database `msph_dev` (matches
  `apps/server/.env`'s `DATABASE_URL`). **This is dev-container-local
  setup, not committed anywhere except as the example in
  `.env.example`** — a fresh machine needs its own Postgres instance and
  its own `apps/server/.env`.
- `pnpm --filter @msph/server prisma:migrate` — applied migration
  `20260911112014_init`, created all 12 tables.
- `pnpm --filter @msph/server prisma:seed` — seeded admin user + 2
  treatments.
- Started the server (`pnpm dev` in `apps/server`) and confirmed:
  - `GET /api/health` → `200 {"status":"ok",...,"database":"connected"}`.
  - `GET /api/nonsense` → `404` with the standard `ApiErrorBody` shape.
  - `GET /socket.io/?EIO=4&transport=polling` → `200`, Socket.IO responds.
- Built desktop for production (`pnpm build` in `apps/desktop`) — Vite
  renderer + both `tsc` passes succeed.
- Started the Vite dev server standalone (port 5173) — serves the app.
- Launched the actual Electron window under `xvfb-run` (this container has
  no real display) — **it opened and loaded the Vite dev app**, confirming
  the whole Electron+Vite+React wiring genuinely works, not just
  typechecks. (Without Xvfb, Electron fails with "Missing X server or
  $DISPLAY" — expected in any headless container; on a real desktop/dev
  machine `pnpm dev` in `apps/desktop` just works.)
- Mobile: `pnpm typecheck` clean; `expo export --platform web` produced a
  working static bundle for every route (`/login`, `/`, `/profile`,
  `/upcoming`, `/visit/[id]`, `/_sitemap`, `/+not-found`); started `expo
  start --web` and confirmed Metro bundler serves `http://localhost:8081`
  (`/status` → `packager-status:running`).
- All background dev processes (server, vite, electron, expo/metro) were
  stopped again after verification — nothing is left running.

**Nothing beyond the foundation above is implemented.** There is no
working login, no case list, no ability to actually create a case, no
photo upload, no calendar. Every non-Dashboard desktop page and every
mobile screen beyond Today's connection banner is a placeholder. This is
intentional per the "foundation first, don't over-engineer yet"
instruction — see Next steps for the build order.

## 9. Known issues / gotchas for the next session

### 9.1 Electron main process must compile to `.cjs`, not `.js`

`apps/desktop/package.json` has `"type": "module"` (needed for Vite/ESM in
the renderer). If the Electron main/preload files are named `.ts` and
compiled to `dist-electron/*.js`, Node treats that `.js` output as ESM
(because it inherits `"type": "module"` from the nearest `package.json`)
even though `tsconfig.electron.json` compiles to CommonJS syntax —
crashes immediately with `ReferenceError: exports is not defined in ES
module scope`. **Fix already applied**: the source files are
`electron/main.cts` / `electron/preload.cts` (TypeScript's `.cts`
extension), which forces `.cjs` output regardless of the package's `type`
field. If you ever add more Electron main-process files, use `.cts` too,
not `.ts`.

### 9.2 `pnpm --version` / `packageManager` field

See section 2 — if `pnpm install` fails with
`ERR_PNPM_NO_MATCHING_VERSION` for the pinned version, update
`packageManager` in root `package.json` to a version that actually
resolves (`pnpm view pnpm versions` or just use the pnpm already on the
machine) and retry.

### 9.3 `@types/react-dom` peer warning on install (harmless)

`pnpm install` prints `apps/mobile └─┬ @types/react-dom 18.3.7 └── ✕ unmet
peer @types/react@^18.0.0: found 19.2.18`. This comes from a transitive
dependency, not something we declared, and does not affect typecheck or
build (`apps/mobile` typechecks clean). Safe to ignore; revisit only if it
starts causing real type errors after an Expo SDK upgrade.

### 9.4 No linting configured yet

Root `package.json` intentionally has no `lint` script — ESLint/Prettier
were not set up this session (not in scope for "stabilize the foundation
first"). Add ESLint (flat config, `@typescript-eslint`, a React plugin for
desktop, an RN-aware config for mobile) as an early Next step; wire a root
`lint` script once every package has one.

### 9.5 Desktop root `tsconfig.json` sets `noEmit: false` but Vite doesn't use its output

`tsc -b` in `apps/desktop`'s `build`/`typecheck` scripts does emit JS into
`dist/`, but the actual renderer bundle comes from `vite build` (esbuild/
rollup), which runs after `tsc -b` in the `build` script and wipes `dist/`
first (`emptyOutDir: true`). This is harmless (tsc's emit here is purely
so `noUncheckedIndexedAccess`/strict-mode errors surface — Vite alone
doesn't typecheck) but slightly wasteful. Not worth changing now; if it
ever gets confusing, switch `tsc -b`'s role in that script to pure
typecheck (`--noEmit`) and drop the emit.

## 10. Next steps (recommended order for the next session)

1. **Auth module** (server): `POST /api/auth/login`,
   `/api/auth/refresh`, `/api/auth/logout`, `requireAuth`/`requireRole`
   middleware (JWT in `Authorization: Bearer`, refresh token rotation via
   the `RefreshToken` table). Wire mobile's `login.tsx` and add a desktop
   login screen once this exists. Zod schemas already exist in
   `packages/shared/src/validation/auth.ts`.
2. **Customers / Landlords / Properties CRUD** (server routes + services) —
   needed before Cases can be created for real.
3. **Cases module**: `POST /api/cases` implementing the manual intake
   workflow (`createCaseSchema` already models customer+property+landlord
   +problem+optional initial visit in one call), `GET /api/cases` (list,
   filterable by status per `caseListQuerySchema`), `GET /api/cases/:id`
   (returns `CaseWithRelations`), `PATCH /api/cases/:id`. Wire desktop's
   `CasesPage` and a real case-detail screen (the brief wants a visible
   timeline: request → consultation → inspection → treatment(s) →
   follow-up → resolution — build it from the case's `visits` array,
   ordered).
4. **Visits module**: schedule/start/complete visit endpoints
   (`scheduleVisitSchema`/`startVisitSchema`/`completeVisitSchema` already
   exist), assignment to a worker. This is what the mobile Today/Upcoming
   screens and `visit/[id].tsx` need real data from.
5. **Treatments module**: catalog CRUD + `POST
   /api/cases/:id/treatments` to attach one (schemas exist).
6. **Photo upload**: build the storage abstraction described in section 5,
   then a multipart upload endpoint using `uploadPhotoMetaSchema`, then
   wire mobile's "take photo" action (`expo-image-picker` is already a
   dependency and camera permission is already declared in `app.json`).
7. **Wire Socket.IO events** for real: emit `case:created`/`case:updated`/
   `visit:created`/`visit:updated` from the routes above (helpers to add
   in `src/realtime/socket.ts`); have desktop join the `cases` room on
   dashboard mount and case rooms on case-detail mount; make the mobile
   Today screen react to `visit:updated` for its own assigned visits.
8. **Dashboard real data**: replace `DashboardPage`'s `—` counts with real
   queries once the Cases/Visits APIs exist.
9. **ESLint/Prettier** — see 9.4.
10. Eventually: S3/R2 storage driver, email ingestion (the domain is
    already shaped to allow this — nothing today assumes manual intake is
    the only path in), calendar view, desktop packaging
    (electron-builder) for distributable installers.

## 11. Commands reference

```bash
# Install everything (run from repo root)
pnpm install

# First-time DB setup (run from apps/server, or use --filter from root)
pnpm --filter @msph/server prisma:migrate
pnpm --filter @msph/server prisma:seed

# Dev servers
pnpm dev:server      # http://localhost:4000, health at /api/health
pnpm dev:desktop     # Electron + Vite
pnpm dev:mobile      # Expo — scan QR or press w/a/i in the terminal

# Checks
pnpm typecheck                                   # every package
pnpm --filter @msph/server prisma:studio         # DB browser GUI
pnpm --filter @msph/desktop build                # production build check
pnpm --filter @msph/mobile exec expo export --platform web   # bundle check

# Local Postgres in THIS dev container (already created, see section 8)
service postgresql start
# role: msph / msph_dev_password, db: msph_dev
```

## 12. Environment variables

See `.env.example` at repo root for the full documented list — copy it to
`apps/server/.env` and fill in real values. Never commit `.env` files
(already gitignored) or hardcode secrets in code.
