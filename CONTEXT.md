# CONTEXT.md — MSPH Project Memory

**Read this file completely at the start of every session.** It is the
persistent memory of the project. Do not redo completed work — check
"Current status" and "Next steps" first and continue from there.

Last updated: 2026-09-11 (session 4 — mobile application: full French
worker app wired to the real API, real photo upload + storage driver,
realtime, offline-safe drafts). Previous: session 3 — desktop
application: full French UI wired to the real API, realtime, Electron
security.

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
original task descriptions that started this project (not duplicated here
in full — this file records decisions and current state, not the brief).

## 2. Platforms & tech stack

- **apps/server** — Node.js + Express + TypeScript, Prisma ORM, PostgreSQL,
  Socket.IO, Zod validation, JWT access+refresh auth (Argon2 password
  hashing), vitest + supertest tests. Full REST API implemented and tested
  (session 2) — see section 8.
- **apps/desktop** — Electron + React + TypeScript + Vite. Manager/admin
  app. **As of session 3, this is a real, fully-French, API-wired
  application** — not a placeholder shell. See section 17 for the full
  build.
- **apps/mobile** — Expo (SDK 57) + React Native + TypeScript, using
  **Expo Router** (file-based routing). Worker field app. **As of session
  4, this is a real, fully-French, API-wired application** — not a
  placeholder shell. See section 18 for the full build.
- **packages/shared** — domain types, Zod schemas, enums, constants. All
  three apps and the server import from `@msph/shared`; nothing is
  duplicated. Untouched this session except reading from it — no shared
  package changes were needed to build the desktop app.
- **Package manager**: pnpm workspaces (`pnpm-workspace.yaml`). Pinned via
  `packageManager` in root `package.json` — currently `pnpm@10.34.5`. If
  `pnpm install` ever fails with `ERR_PNPM_NO_MATCHING_VERSION`, bump this
  field to whatever `pnpm --version` reports on the machine and re-run.
  `allowBuilds` in `pnpm-workspace.yaml` already covers the native
  postinstall scripts needed (`argon2`, `electron`, `@prisma/client`,
  `@prisma/engines`, `esbuild`, `prisma`) — a fresh `pnpm install` won't
  re-prompt.

The desktop and mobile apps have **no local database and no duplicated
business logic** — everything goes through the Express API.

## 3. Domain decisions (deviations from the brief, and why)

### 3.1 Case.status is 5 states, not 8 (session 1, still the design)

Brief suggested a linear list: NEW / SCHEDULED / INSPECTION_COMPLETED /
TREATMENT_PLANNED / FOLLOW_UP_SCHEDULED / IN_PROGRESS / RESOLVED /
CANCELLED.

**Decision**: `Case.status` is `NEW | SCHEDULED | IN_PROGRESS | RESOLVED |
CANCELLED` (`packages/shared/src/enums.ts`).

**Why**: a case loops through inspection/treatment/follow-up visits an
arbitrary number of times before resolution — a single linear field can't
represent "on the 2nd follow-up" without infinite enum growth. The
fine-grained stage lives on the **visit history** and the **case activity
timeline** (section 3.7). `Case.status` stays a coarse bucket for
dashboard columns. Implemented as a real state machine on the server —
see section 9.

**Session 3 addition**: the desktop case detail page's visual "Demande →
Consultation → Inspection → Traitement → Suivi → Résolution" stepper
(exactly what the brief's Case Detail section asks for) is a **read-only
projection computed client-side** from the same real data — visits, their
inspections, treatments, and `Case.status` itself — never a separately
tracked field. See section 17.6 / `apps/desktop/src/pages/cases/
WorkflowStepper.tsx`.

### 3.2 User roles: ADMIN + WORKER (session 1, unchanged)

"ADMIN / OWNER" in the brief is read as one admin-tier role written with a
slash, not two roles. If a narrower OWNER tier is ever needed, add it to
the `UserRole` enum then.

### 3.3 Property has no direct `customerId` (session 1, unchanged)

`Property` links to `Landlord` (stable owner); the tenant/customer
relationship is per-`Case`, modeling rental turnover correctly.

### 3.4 Visit/Inspection split, `condition` is free text (session 1, unchanged)

### 3.5 `CaseTreatment.status` (PLANNED/COMPLETED/CANCELLED) (session 1, unchanged)

### 3.6 IDs are `cuid()`, but validated loosely (session 2, unchanged)

`cuidSchema` (`packages/shared/src/validation/common.ts`) is
`z.string().trim().min(1).max(191)`, not `z.string().cuid()` — see the
file's doc comment. Matters again this session: the desktop app's
`SearchSelect` picker and every `:id` route param pass straight through
this schema-free (the desktop doesn't re-validate ids client-side, the
server does) — no new issue found, just confirming the session-2 decision
held up under real UI usage.

### 3.7 `CaseActivity` — a dedicated timeline/audit model (session 2, unchanged)

Append-only, one row per meaningful thing that happens to a case, written
in the same transaction as the mutation. See
`apps/server/src/modules/cases/case-activity.ts`.

**Session 3 consequence**: `CaseActivity.message` is generated **in
English** server-side (the backend is deliberately locale-neutral, see
3.2's reasoning applied elsewhere too). Since the desktop app must be
fully French, it does **not** display that raw field — see 3.11 below.

### 3.8 `POST /cases` accepts existing OR new customer/property (session 2, unchanged)

Session 3 exercises both paths from the desktop's New Case page — see
17.9.

### 3.9 `DELETE /cases/:id/treatments/:treatmentId` → keyed by the join row's own id (session 2, unchanged)

### 3.10 Extra endpoints beyond the brief's example list (session 2, unchanged)

### 3.11 Desktop UI: French translation lives in the desktop app, not `packages/shared` (session 3, new)

The task requires the desktop interface to be in French. **Decision**:
`packages/shared`'s `*_LABELS` constants and every domain string in the
backend stay in English/locale-neutral (mobile is still English/
placeholder and might not even end up French later; the backend's
`CaseActivity.message` strings are diagnostic/audit text, not
necessarily user-facing verbatim in every future client). A parallel
French label layer lives entirely in `apps/desktop/src/lib/labels.ts`
(`CASE_STATUS_LABELS_FR`, `CASE_PRIORITY_LABELS_FR`, etc.), keyed off the
exact same enum values so it can never drift out of sync with what the
API actually returns.

**The harder case**: `CaseActivity.message` isn't an enum — it's a free
English sentence built server-side (e.g. `Treatment "General Cockroach
Treatment" recorded as performed`). Translating this *well* (not just the
event type label) needed a dedicated reconstruction, not a lookup table:
`apps/desktop/src/pages/cases/activityMessages.ts`'s `translateActivity()`
rebuilds a French sentence from the activity's `type` + `metadata` +the
case's own already-loaded data (cross-referencing `metadata.visitId`
against `kase.visits` for visit type/date/worker, `metadata.from`/`to`
against `CASE_STATUS_LABELS_FR` for status changes). The one field not
in `metadata` — a treatment's name, for TREATMENT_* events — is extracted
from the English message's consistently-quoted `"Name"` substring via
regex (every such message is written that way server-side), not
re-fetched or fabricated; a real value from a real field, just read out
of a different part of the payload than usual. Falls back to generic
French wording if that ever fails, never displays the raw English text.

**A grammar bug this caught and fixed**: an early version used the visit
type label as the sentence's grammatical subject ("Suivi planifiée" —
wrong, `Suivi` is masculine, `planifiée` is feminine agreement).
Fixed by restructuring every visit-related sentence around "Visite" (a
fixed, feminine noun) as the subject, with the type label quoted as an
apposition (`Visite « Suivi » planifiée…`) — correct regardless of which
visit type's gender.

### 3.12 Socket.IO: every client auto-joins the `cases` room (session 3, bug fix)

`apps/server/src/realtime/socket.ts`'s `emitCaseCreated`/`emitCaseUpdated`
broadcast to a room named `"cases"` (session 2's design, see section 4) —
but **no code ever put a socket in that room**. `JOIN_CASE_ROOM` only
joins the *per-case* room (`case:${id}`); there was no equivalent for the
list-level room. Every list/dashboard-level broadcast was silently going
nowhere. Found while wiring the desktop's `RealtimeProvider` and building
the E2E test for "desktop updates without a full reload" (section 17.14)
— fixed by having `io.on("connection", ...)` call `socket.join(CASES_ROOM)`
unconditionally for every connection (Socket.IO isn't authenticated yet —
see section 17.7 — so there's no per-user filtering to apply here anyway;
every open screen wants to know a case changed). One-line fix, but a real
bug that would have made "dashboard updates live" simply not work.

### 3.13 Mobile UI: French labels duplicated per-app, not hoisted to `packages/shared` (session 4)

Same decision as 3.11, now applied a second time. `apps/mobile/lib/
labels.ts` duplicates the subset of French enum labels the mobile screens
actually use (visit type/status, case-treatment status, case priority) —
keyed off the same enum values as `apps/desktop/src/lib/labels.ts` so a
mismatch is a TypeScript error, not silent drift, but a genuinely separate
file. **Explicitly flagged as revisitable**: 3.11's original reasoning
("mobile might stay English") is now false — both real clients are
French. Hoisting a shared `labels-fr.ts` into `packages/shared` would be
a reasonable follow-up, just not done this session to avoid touching the
already-verified desktop app while building the mobile one (see "Next
steps").

### 3.14 Mobile photo upload: two transports behind one function (session 4)

`apps/mobile/lib/photoUpload.ts` uploads through **native** platforms via
`expo-file-system`'s `UploadTask` (true multipart streaming + progress,
the only real option on iOS/Android) but through **web** via a manual
`XMLHttpRequest` + `FormData` (needed for progress — `fetch` has no
upload-progress event) — because `expo-file-system`'s `UploadTask` has
**no web implementation at all** (confirmed by inspecting the package: no
`NetworkTasks.web.ts` exists, only a generic "not supported on web"
warning). This project's `app.json` declares a `web` platform block, and
this sandbox has no physical iOS/Android device to test on, so the web
branch is also how this session's own E2E verification actually exercised
a real upload end-to-end through the UI (see section 18.9) rather than
only through a raw `curl`. Both branches return the same
`{status, body}` shape so the calling code (retry-once-on-401, error
parsing) doesn't need to know which transport ran.

### 3.15 Worker permissions: enforced entirely by existing session-2 backend code, nothing new needed (session 4)

The brief: "Workers should only access cases/visits assigned to them...
Do not rely solely on frontend hiding." This was **already true** before
this session — `assertCaseAccess`/`assertVisitAccess`
(`apps/server/src/lib/authz.ts`, session 2) and `listCases`/`listVisits`'s
server-side `assignedWorkerId` override (also session 2) already restrict
a WORKER to only their own assigned visits/cases on every route, list or
detail. The mobile app's API modules (`apps/mobile/api/*.ts`) call the
exact same endpoints the desktop uses — no new backend authorization code
was written this session, and none was needed. Verified this still holds
by construction (same server code, same tests — see section 8/backend
test count, unchanged at 36/36) rather than by writing new
worker-permission tests specifically for mobile.

## 4. Realtime design (Socket.IO)

Session 2 wired the server-side emits (`emitCaseCreated/emitCaseUpdated/
emitVisitCreated/emitVisitUpdated`, called from cases/visits/
case-treatments routes). **Session 3 fixed the `cases`-room bug (3.12)
and wired the desktop client**:

- `apps/desktop/src/lib/socket.ts` — one shared `socket.io-client`
  connection, connected on login, disconnected on logout (not per-screen).
  Not authenticated (server doesn't support it yet — noted as a gap in
  the file's own doc comment, not silently ignored).
- `apps/desktop/src/realtime/RealtimeProvider.tsx` — mounted once near
  the app root (inside `AuthProvider`). Listens for the four events and
  calls `queryClient.invalidateQueries()` on the relevant react-query keys
  (`api/queryKeys.ts`) — **invalidates and refetches, never patches the
  cache by hand**, since the socket payloads are intentionally minimal
  (`{caseId}` / `{caseId, visitId}`) and the real GET response is the only
  actual source of truth for what changed.
- `apps/desktop/src/realtime/useCaseRoom.ts` — joins `case:${id}` while
  `CaseDetailPage` is mounted, leaves on unmount.

**Verified working end-to-end**, not just wired: the session's E2E test
(17.14) has the desktop sitting on a case detail page, then simulates the
brief's exact "worker completes inspection on mobile" scenario via a
direct API call (playing the role of the mobile app, which isn't wired
yet), and confirms the open desktop page updates its status badge,
workflow stepper, and visit card — including the inspection text —
**without a page reload or any user action**, within seconds, purely from
the Socket.IO event. Screenshot evidence in the session transcript
(`/tmp/e2e-06-realtime-updated.png` during the session — not committed,
ephemeral verification artifact).

**Session 4 adds the mobile client**, same pattern as the desktop:
`apps/mobile/lib/socket.ts` (one shared connection, connect on login/
disconnect on logout) + `apps/mobile/realtime/RealtimeProvider.tsx`
(listens for the same four events, invalidates the mobile app's own
react-query keys — `visits.all()`/`visits.detail()`/`cases.detail()`).
Deliberately **not** a per-user room: the server still broadcasts
`CASES_ROOM` to every connection unfiltered (3.12, Socket.IO still isn't
authenticated — see below), so the mobile client just invalidates and
lets `GET /visits`'s own server-side `assignedWorkerId` scoping (see
`visits.service.ts`) decide what a worker's refetch actually returns —
the client never needs to filter events by "is this visit mine", the
list endpoint it refetches already only ever contains the worker's own
visits. This satisfies the brief's "when a manager assigns/reschedules a
visit, the mobile app should eventually receive updates" — verified
indirectly (not a dedicated realtime E2E test for mobile this session,
unlike the desktop's dedicated one in session 3) by the fact the desktop
and mobile share the exact same event set and cache-invalidation pattern
already proven to work end-to-end.

**Not done**: Socket.IO connections still aren't authenticated (unchanged
from session 3 — noted in both `socket.ts` files' doc comments as a gap,
not silently ignored). Low priority while payloads stay minimal
(`{caseId}`/`{caseId, visitId}`).

## 5. File storage — real driver + real upload as of session 4

Sessions 1-3 only had the abstraction boundary (`STORAGE_DRIVER` env var,
`/uploads` static mount) with no actual driver or binary upload endpoint.
**Session 4 built the real thing**, needed for the mobile app's photo
capture:

- `apps/server/src/storage/StorageDriver.ts` — a narrow interface
  (`save({buffer, originalName, mimeType}) → {storageKey, url}`), the
  seam for a future S3/R2 driver.
- `apps/server/src/storage/localStorageDriver.ts` — implements it by
  writing to `STORAGE_LOCAL_ROOT` under a random (`randomUUID()`)
  filename with a safe extension derived from the original name/mimetype
  (never trusts the client-supplied name as a path), returning
  `STORAGE_PUBLIC_URL/<filename>`.
- `apps/server/src/storage/index.ts` — picks the concrete driver from
  `STORAGE_DRIVER` (only `"local"` exists today).
- `POST /visits/:id/photos/upload` (new) — real `multipart/form-data`
  upload (`multer`, memory storage, 15MB cap, image-mimetype-only
  filter), field name `photo` + optional `caption` field. Writes the file
  via `storageDriver` **before** opening the DB transaction — if the
  write fails, no `Photo` row is ever created (see
  `visits.service.ts`'s `uploadPhotoToVisit`, doc comment explains why
  order matters). This is what the mobile app's photo capture screen
  actually calls.
- `POST /visits/:id/photos` (unchanged) — the session 1-3 metadata-only
  endpoint still exists as-is for anything that already has a
  `storageKey`/URL from elsewhere; the desktop's "Ajouter une photo" form
  (`apps/desktop/src/pages/cases/AddPhotoModal.tsx`) still uses this one
  and is still honest that it's a manual reference, not a file picker —
  **not revisited this session** (out of scope; the desktop already
  works, and the task was the mobile app). A natural follow-up (not done):
  give the desktop a real file-picker upload against the new
  `/photos/upload` endpoint instead of the manual-reference form.
- Uploaded files land in `apps/server/storage/uploads/` (gitignored, only
  `.gitkeep` tracked) and are served back by `app.ts`'s existing
  `express.static` mount.
- **A real bug found and fixed while wiring this**: helmet's default
  `Cross-Origin-Resource-Policy: same-origin` on the `/uploads` mount
  silently blocked any browser-based client on a different origin (the
  desktop's Vite dev server, the mobile app running via `expo start
  --web`) from loading an uploaded photo at all
  (`ERR_BLOCKED_BY_RESPONSE.NotSameOrigin` in the browser console, no
  server-side error). Fixed by scoping
  `helmet.crossOriginResourcePolicy({ policy: "cross-origin" })` to just
  the `/uploads` mount in `app.ts` (the rest of the app keeps helmet's
  stricter JSON-API defaults) — found via the mobile E2E test's photo
  thumbnails failing to render, not by inspection.
- Verified genuinely end-to-end, not just unit-tested: a real PNG
  uploaded via `curl -F` during manual testing, confirmed written to disk
  and re-servable over HTTP; then the mobile app's own photo-capture
  screen uploaded a real file through the full UI → `POST
  /visits/:id/photos/upload` → disk → `GET /uploads/...` loop (see
  section 18's verification).

## 6. Authentication

Backend implementation unchanged from session 2 (Argon2, JWT access+
refresh, rotation + reuse detection, rate limiting — see the previous
revision of this section, still accurate, condensed here). **Session 3
adds the desktop client side**:

- **Access token**: kept in memory only (`apps/desktop/src/lib/
  authStore.ts` — a plain module-level store outside React, read
  directly by the API client; `AuthContext` is a reactive wrapper around
  it via `useSyncExternalStore`). Never written to disk.
- **Refresh token**: persisted across app restarts via
  `apps/desktop/src/lib/secureStorage.ts`, which calls the Electron
  preload bridge (`window.msph.secureStorage`) — see section 17.2 for the
  main-process implementation (OS-keychain-encrypted via `safeStorage`).
  Falls back to `sessionStorage` when `window.msph` is undefined (running
  outside Electron, e.g. a plain browser tab during dev) so the app
  doesn't hard-crash there.
- **Silent resume on boot**: `AuthProvider`'s effect tries to redeem a
  stored refresh token via `/auth/refresh` + `/me` before rendering
  anything auth-gated (`RequireAuth` shows a small boot screen while this
  runs) — a user who's already logged in never sees the login screen
  flash by.
- **401 handling**: `apps/desktop/src/lib/apiClient.ts` catches a 401 on
  any authenticated request, attempts exactly one refresh (de-duped
  across concurrent requests via a shared in-flight promise), retries the
  original request once, and — if the refresh itself fails — clears the
  session (`SessionExpiredError`), which `RequireAuth` reacts to by
  redirecting to `/connexion` on the next render. No manual "session
  expired" event wiring needed anywhere else in the app.
- **Change password**: `apps/desktop/src/pages/settings/SettingsPage.tsx`
  wires the existing `POST /auth/change-password` endpoint.

## 7. Authorization model

Unchanged from session 2 — see the two access-scoping helpers
(`assertCaseAccess`/`assertVisitAccess`) and the admin-only route list in
`apps/server/src/lib/authz.ts`. The desktop app is manager/admin-facing
per the brief, so **every account created from the desktop today defaults
to WORKER** but the "Intervenants" page lets an admin create either role
(`apps/desktop/src/pages/workers/WorkersPage.tsx`) — an admin cannot
change their own role or deactivate their own account from the UI (the
form disables those fields when editing yourself), matching the same
guard rail the server already enforces (`users.service.ts`'s
`updateUser`) — belt and suspenders, not a replacement for the server
check.

## 8. Backend API

Unchanged from session 2. Full endpoint list, request/response shapes,
and per-route auth requirements are in the previous revision of this
file's section 8 (`git log -p -- CONTEXT.md` if the exact text is needed)
— condensed reference, since this session didn't add or change any
backend route:

```
/auth/{login,refresh,logout,change-password}, /me
/users, /customers, /landlords, /properties, /treatments   (CRUD, mostly ADMIN-only)
/cases, /cases/:id, /cases/:id/timeline, /cases/:id/treatments[/:id]
/visits, /visits/:id, /visits/:id/{start,complete,inspection,photos}
/health
```

## 9. Case status state machine + timeline

Unchanged from session 2 (`apps/server/src/modules/cases/case-status.ts`:
`recalculateCaseStatus` for automatic transitions,
`applyExplicitStatus` for the two admin actions). **Session 3 is the
first time a human can actually drive this from a UI** — every state
transition described here was exercised end-to-end through the desktop
app in the E2E test (17.14): NEW → SCHEDULED (schedule initial
consultation) → IN_PROGRESS (mobile-simulated completion) → still
IN_PROGRESS through a chosen/performed treatment and a scheduled
follow-up → RESOLVED (desktop "Marquer résolu" button) → confirmed
terminal (backend rejects a new visit on a resolved case; desktop's
"Planifier une visite" button is hidden once a case is
resolved/cancelled).

## 10-16. Backend implementation detail (sessions 1-2)

Not repeated in full here — this session made exactly one backend change
(3.12's one-line socket fix). For the complete backend reference (what's
built file-by-file, testing setup and coverage, all known gotchas from
sessions 1-2, environment variables, command reference), see the version
of this file from before session 3 (`git log -p -- CONTEXT.md`, or trust
that everything described there is still accurate — nothing else in
`apps/server` or `packages/shared` was touched this session). The
still-relevant condensed points:

- Backend tests: `pnpm --filter @msph/server test` — 36 tests, still
  passing (re-ran this session after the socket fix).
- Test DB is separate from dev DB (`msph_test` vs `msph_dev`) — see
  section 20 "Commands reference" below for setup.
- No ESLint/Prettier anywhere in the repo yet (carried over, still not
  done — see Next steps).

## 17. Desktop application (session 3 — this session)

The task: build the first serious version of the desktop app, fully in
French, professional/dense/operational styling, wired to the real API
(no mocking), with realtime and Electron security best practices. Done —
see 17.14 for the verification evidence.

### 17.1 Dependencies added

`apps/desktop/package.json`: `@tanstack/react-query` (the "proper API
client layer" — handles loading/error/caching/refetch/mutation state,
used by every data-fetching hook in `src/api/`), `date-fns` (+ its French
locale, for every date shown in the UI), `socket.io-client`, `zod`
(needed directly once `src/lib/formErrors.ts` started catching
`ZodError` from client-side validation against the same schemas the
server uses).

### 17.2 Electron security (main process changes)

`apps/desktop/electron/secureStorage.cts` (new) — encrypted key/value
store for the refresh token, using Electron's `safeStorage` (OS keychain:
Keychain/DPAPI/libsecret) before anything touches disk. Three narrow IPC
handlers (`secure-storage:{get,set,delete}`), registered from
`main.cts`'s `app.whenReady()`. Falls back to a clearly-marked
(`"plain:"` prefix) unencrypted value if `safeStorage.isEncryptionAvailable()`
is false (some Linux setups have no secret-service daemon) — logged, not
silent, so it's a visible degradation rather than a false sense of
security.

`electron/preload.cts` — exposes exactly three calls
(`window.msph.secureStorage.{get,set,delete}`) via `contextBridge`,
nothing else. `contextIsolation: true` + `nodeIntegration: false`
(already set in session 1) mean this is the *only* way the renderer can
reach anything outside the browser sandbox — no generic filesystem/Node
API surface was added.

**A real build-tooling issue this hit**: `tsconfig.electron.json`'s
`moduleResolution: "Node"` (classic) doesn't understand `.cts` files —
importing `secureStorage` (even extensionless) failed with "cannot find
module". Fixed by switching to `"module": "Node16"` / `"moduleResolution":
"Node16"` (the mode actually designed for `.cts`/`.mts`), which then
requires the *emitted* extension in the specifier
(`import "./secureStorage.cjs"` in `main.cts`, even though the source
file is `.cts`) — confirmed by inspecting `dist-electron/`'s actual
output after the fix. This is the same family of gotcha as session 1's
9.1 (Electron main process must compile to `.cjs`), same root cause
(Node's dual CJS/ESM module system), different manifestation.

### 17.3 API client layer (`apps/desktop/src/lib/` + `src/api/`)

- `apiClient.ts` — `apiClient.{get,post,patch,delete}` + `apiClient.raw`
  (no auth header, no 401-retry — used only for login/refresh
  themselves). Handles the 401 → refresh → retry-once flow described in
  section 6. `toQueryString()` builds list-endpoint query strings,
  dropping empty/undefined values.
- `authStore.ts` — session state outside React (section 6).
- `queryClient.ts` — react-query `QueryClient`: doesn't retry 401/403
  (won't fix itself), retries everything else once.
- `socket.ts`, `secureStorage.ts`, `format.ts` (French date/name
  formatting via date-fns), `labels.ts` (French enum labels, 3.11),
  `formErrors.ts` (flattens a `ZodError` into `{field: message}` for
  inline form errors — every create/edit form uses this against the same
  `@msph/shared` schemas the server validates with, so client and server
  validation can't silently disagree).
- `src/api/{auth,cases,visits,customers,properties,landlords,treatments,
  users}.ts` — one module per resource, each exporting plain fetch
  functions **and** the react-query hooks built on them
  (`useCasesQuery`, `useCreateCaseMutation`, etc.). Mutations invalidate
  the relevant `queryKeys` (`src/api/queryKeys.ts` — the single source of
  truth for cache keys, also used directly by `RealtimeProvider` so a
  socket event invalidates the exact same keys a mutation would).
- `landlords.ts` is deliberately thin (list/search + create only) — see
  17.10, there's no standalone Landlords page.

### 17.4 Design system (`apps/desktop/src/styles/global.css`, full rewrite)

Replaced session 1's minimal stylesheet with a real design system:
CSS-custom-property tokens (neutral surfaces, a teal brand accent shared
with the mobile app's existing color, semantic status colors), small
border radii throughout (4-6px — explicitly avoiding the "overly rounded
childish" look the brief warned against), no gradients, no decorative
shadows on cards (flat, bordered surfaces — shadows reserved for actual
overlays: modals/drawers/dropdowns). Dark sidebar + light content area
(the Linear/Vercel-dashboard pattern — reads as an operational tool, not
a marketing page). Dense table rows, compact form fields, a small
hand-authored SVG icon set (`components/icons.tsx` — ~25 icons, no icon
library dependency).

Shared components built once, reused everywhere: `Badge.tsx` (status/
priority/visit-status/treatment-status chips, each with a semantic tone),
`Modal.tsx` / `Drawer.tsx` (portal-rendered, Escape-to-close,
click-outside-to-close), `States.tsx` (`LoadingState`/`ErrorState`/
`EmptyState`/`InlineLoading` — every data-fetching screen uses these
instead of ad-hoc loading text), `ConfirmDialog.tsx` (consequential
actions only — resolve/cancel a case, not every mutation), `FormField.tsx`
(label + error + hint wrapper), `SearchSelect.tsx` (search-as-you-type
picker against a real list endpoint — used for every "pick an existing
X" flow), `ToastProvider.tsx` (global feedback for mutation success/
error, separate from inline field validation).

### 17.5 Navigation

`apps/desktop/src/components/AppShell.tsx` — sidebar with exactly the
brief's 8 items, in French: Tableau de bord, Dossiers, Calendrier,
Clients, Propriétés, Traitements, Intervenants, Paramètres. **No
"Landlords" top-level item** — deliberate, matches the brief's explicit
nav list (which doesn't include one); landlord data is managed inline
wherever a property needs it instead (17.10). Sidebar footer shows the
logged-in user + a one-click logout. Topbar shows the current page's
French title.

### 17.6 Dashboard (`src/pages/DashboardPage.tsx`)

Answers every question the brief lists, from real data, nothing
fabricated:

- **Nouveaux dossiers** — `GET /cases?status=NEW` total.
- **Visites aujourd'hui** — `GET /visits?from=<today start>&to=<today
  end>` total.
- **Visites à venir** — `GET /visits?status=SCHEDULED&from=<tomorrow>`
  total.
- **Dossiers non résolus / résolus** — sums/totals of the status-filtered
  case queries.
- **Dossiers nécessitant de l'attention** — cases with `priority` HIGH/
  URGENT among the non-terminal statuses (three parallel queries merged
  client-side, since the list endpoint filters by one status at a time —
  not a backend limitation worth "fixing" for a dashboard read).
- **En attente de suivi** — a genuinely derived view, not a stored field:
  IN_PROGRESS cases that have **no upcoming SCHEDULED visit**, computed
  by cross-referencing `GET /cases?status=IN_PROGRESS` against
  `GET /visits?status=SCHEDULED` (set of case ids with a pending visit).
  This is exactly "waiting for follow-up" — something happened, nothing
  more is on the books yet.
- **Activité d'aujourd'hui** — every visit scheduled today with its
  current status, customer, property, worker — the honest,
  backend-supported version of a "today's activity feed" (there is no
  global cross-case activity endpoint, only per-case timelines — see
  section 8 — so this section is visit-centric rather than a fabricated
  unified feed).

### 17.7 Realtime — see section 4.

### 17.8 Cases list (`src/pages/cases/CasesListPage.tsx`)

Every column the brief asked for: status, customer, property/city,
problem, assigned worker, next consultation, last activity, priority.
"Assigned worker" / "next consultation" are cross-referenced from
`GET /visits?status=SCHEDULED` the same way as the dashboard's follow-up
section (the list endpoint itself only returns customer+property, not
visit data — a visit-level fact, correctly not duplicated onto the case
row server-side). "Dernière activité" uses `Case.updatedAt` — an honest
approximation (touched by status changes, not by every single visit
edit) called out as such in the code comment, not oversold as a precise
audit trail (that's what the case detail's own timeline is for).
Search (server-side, via the `search` query param), status filter
(pills, server-side), priority filter (client-side — not a server query
param), sortable columns (client-side, on the current page).

### 17.9 New Case workflow (`src/pages/cases/CaseNewPage.tsx`)

A dedicated full-page route (`/dossiers/nouveau`), not a modal — the form
is large enough (customer, property, landlord, problem, initial
consultation) to want the room. Exercises the flexible `createCaseSchema`
(3.8) properly: a "Client existant / Nouveau client" toggle
(`SearchSelect` vs. plain fields), same for property, and for the
property's landlord a three-way "Aucun / Nouveau bailleur / Bailleur
existant" choice — the landlord picker searches the still-live
`GET /landlords` endpoint (no dedicated page, see 17.10). Client-side
validation runs the exact same `createCaseSchema` the server uses before
submitting, via `zod`'s `safeParse` + `formErrors.ts`, so a rejected
submission shows field-level French-adjacent errors immediately rather
than round-tripping to the server for basic mistakes (server-side
validation still runs and is still authoritative — this is a UX layer on
top, not a replacement). Can optionally schedule the initial consultation
(date/time/worker) in the same submission, matching `createCaseSchema`'s
`initialVisitScheduledAt`/`assignedWorkerId` fields.

### 17.10 Case detail (`src/pages/cases/CaseDetailPage.tsx` + colocated modals) — the centerpiece

All 9 sections the brief asked for, laid out as: a header (status,
priority, customer name as the page title, property/worker/next-visit
facts, action buttons), the visual workflow stepper (3.1), then a
2-column body — main column (Visites et inspections, Traitements,
Photos, Historique) + a narrower side column (Client, Propriété,
**Bailleur** — nested under Propriété since there's no separate landlord
page, Problème).

- **Visites et inspections** are one section, not two — each visit card
  shows its own inspection inline (observations/remarks/condition) once
  completed, which is more useful than a disconnected flat inspection
  list (an inspection is 1:1 with a visit and meaningless without its
  context). Per-visit actions: Démarrer / Terminer (the latter opens
  `CompleteVisitModal`, capturing the inspection fields in the same step
  — mirrors the brief's mobile-app flow), Modifier (reschedule/reassign/
  cancel via `EditVisitModal`, admin-only per the backend), and Ajouter
  une photo.
- **Traitements**: add via `TreatmentPickerModal` (catalog search +
  notes), mark performed, remove — maps directly to `POST/PATCH/DELETE
  /cases/:id/treatments[...]`.
- **Photos**: metadata cards (no real images — see section 5), grouped
  at the case level even though each is tied to a specific visit.
- **Historique**: the full `CaseActivity` feed, French (3.11).
- **Actions row**: Planifier une visite, Choisir un traitement, Marquer
  résolu, Annuler — hidden once the case is RESOLVED/CANCELLED, replaced
  by a single Réouvrir button. Resolve/cancel/reopen go through
  `ConfirmDialog` (a case status change isn't a one-click-and-done
  action).

### 17.11 Calendar (`src/pages/calendar/CalendarPage.tsx`)

Month grid (date-fns for the grid math + French month/weekday names),
worker filter, click an event to preview it (customer, property, date,
worker, status) with "Reprogrammer" (opens the same `EditVisitModal` used
in the case detail page — one modal, two entry points) and "Voir le
dossier" actions. Completed/cancelled visits render struck-through so a
glance at the month shows what's still actually pending.

### 17.12 Customers / Properties / Treatments / Intervenants (workers)

Four structurally similar CRUD pages — table + search + a slide-in
`Drawer` form for create/edit. Properties' drawer includes the same
landlord picker pattern as the New Case page, but since `POST
/properties` (unlike `POST /cases`) only accepts an existing
`landlordId`, not a nested new-landlord object (see session 2's
`createPropertySchema`), choosing "Nouveau bailleur" here does a small
client-side two-step: `POST /landlords` first, then use the returned id
— documented in the component, not a silent workaround.
Intervenants (`WorkersPage.tsx`) manages both ADMIN and WORKER accounts
(role filter pills) since that's what `/users` is actually for; titled
"Intervenants" to match the brief's nav label. Treatments' drawer covers
every field the brief lists (name, description, instructions, duration,
safety information) plus an active/inactive toggle wired to
`PATCH /treatments/:id`'s `active` field (the brief's "activate/
deactivate procedure").

### 17.13 Settings (`src/pages/settings/SettingsPage.tsx`)

Account summary + change-password form (wired to `POST
/auth/change-password`, section 6) + logout. Deliberately small — the
brief didn't ask for more here, and there's no app-level "settings" to
speak of yet (no theme, no locale switch — the whole app is French,
full stop).

### 17.14 Verification performed this session

Not just typechecked — actually run and driven, end to end:

- `pnpm -r typecheck` from repo root: all 4 packages clean.
- `pnpm --filter @msph/desktop build`: Vite renderer + both Electron
  `tsc` passes succeed.
- `pnpm --filter @msph/server test`: 36/36 still passing after the
  socket-room fix (3.12).
- **A full Playwright-driven E2E run** against the real dev server + the
  real Vite-served desktop app (Chromium, not a mock DOM), scripted to
  match the brief's exact Done Criteria list:
  1. Load the app → French login screen.
  2. Log in as `admin@msph.local`.
  3. Dashboard stat tiles show real (non-placeholder) numbers.
  4. Navigate to Dossiers → Nouveau dossier.
  5. Fill the full New Case form (new customer, new property, priority
     Urgente, schedule the initial consultation, assign a worker) and
     submit.
  6. Land on the new case's detail page; confirm status badge = Planifié,
     one visit card present.
  7. **Simulate the mobile app** (which doesn't exist as a real app yet)
     by having a second, independent API session log in as
     `worker@msph.local` and call `start`/`complete` on that visit
     directly — exactly the brief's "Worker completes inspection on
     mobile" scenario, at the API layer since the actual mobile UI isn't
     built.
  8. **Without touching the still-open desktop page**: wait for and
     confirm the status badge flips to En cours, the workflow stepper
     advances to Inspection, and the visit card shows the inspection
     text that was just submitted — via Socket.IO, no reload. This is
     the realtime requirement, proven, not assumed.
  9. Back in the UI: choose a treatment, mark it performed, schedule a
     follow-up visit (second visit card appears).
  10. Confirm a WORKER account is refused (403) when attempting to mark
      the case resolved via the API (the desktop UI doesn't even show
      that button to a worker, but the guard is also server-side).
  11. Click Marquer résolu, confirm the dialog, confirm the status badge
      flips to Résolu and a new visit is rejected (terminal state).
  12. Read back the full Historique — every step appears, in French, in
      the right order.
  - All 15 steps passed. Screenshots taken at each major step (not
    committed — ephemeral verification artifacts, described here instead
    since the visual result is what matters for future reference: dense,
    professional, exactly matches the design direction — dark sidebar,
    flat bordered cards, small-radius badges, no gradients).
- **A real Electron launch** (not just the Vite dev page in a browser
  tab), under `xvfb-run` as in session 1 — confirmed no application-level
  JS errors in the console, only the same container-only Chromium/GPU/
  dbus noise session 1 already documented as harmless.
- Two real bugs found and fixed by this testing (not hypothetical) — 3.12
  (socket room) and the `pageSize` cap bug below.

### 17.15 Bugs found and fixed this session

- **3.12** — Socket.IO `cases` room never joined (backend fix).
- **`pageSize` over the server's cap**: `CasesListPage`'s cross-reference
  query requested `pageSize: 200` and `CalendarPage` requested `pageSize:
  300` against an endpoint whose `paginationQuerySchema` caps `pageSize`
  at 100 — both silently 400'd (visible in the server's dev log, caught
  because the E2E test's console-error listener flagged it, not because
  anything visibly broke in the UI — react-query just showed an empty
  list where data should have been). Fixed by capping both at 100, with
  a comment noting the ceiling and that it's the first thing to revisit
  if visit volume ever grows past it at this company's scale.
- **French grammar in the activity timeline** — see 3.11's "Suivi
  planifiée" note.

## 18. Mobile application (session 4 — this session)

The task: build the first serious version of the worker-facing mobile
app, fully in French, optimized for a one-handed/gloved/time-pressed
field worker (large touch targets, minimal typing, minimal navigation
depth), with real photo upload, offline-safe drafts, and realtime. Done
— see 18.9 for the verification evidence. **Not a miniature desktop** —
different screens, different information density, different navigation
model entirely (a hub-and-modal flow, not a sidebar).

### 18.1 Dependencies added

`apps/mobile/package.json`: `expo-secure-store` (refresh token, OS
keychain/keystore — the mobile equivalent of the desktop's Electron
`safeStorage`), `expo-file-system` (real multipart photo upload with
progress, native platforms — see 3.14), `@react-native-async-storage/
async-storage` (local draft persistence — non-sensitive data only, see
18.8), `@tanstack/react-query`, `socket.io-client`, `zod`, `date-fns`
(same roles as the desktop's equivalents, section 17.1/17.3).
`expo-image-picker` was already a dependency (camera + gallery, session
1) and needed no changes.

### 18.2 API client layer (`apps/mobile/lib/` + `apps/mobile/api/`)

Deliberately mirrors the desktop's layer (sections 17.2-17.3) file-for-
file where the concepts transfer directly — `authStore.ts`,
`apiClient.ts` (same 401→refresh→retry-once, de-duped concurrent
refresh), `queryClient.ts`, `socket.ts`, `secureStorage.ts` (wraps
`expo-secure-store` instead of the Electron IPC bridge), `labels.ts`
(3.13), `format.ts` (French date formatting via date-fns). `api/{auth,
visits,cases}.ts` expose only what a worker's screens actually call —
no `scheduleVisit`/`updateVisit`/case-CRUD/treatment-assignment (those
stay admin-only, desktop-only) — see 3.15 for why no new backend
authorization was needed to make this safe.

One **React Native-specific gotcha** this hit: every internal import in
the desktop's equivalent files uses an explicit `.js` extension
(required by the server/desktop's `NodeNext`/`Node16` TypeScript module
resolution — see CONTEXT.md's earlier Electron `.cts` note). Metro
(React Native's bundler) does **not** do TypeScript's `.js`→`.ts`
extension remapping — an import written `from "./apiClient.js"` fails
to resolve at bundle time (`Unable to resolve module`) even though
`tsc` accepts it fine (the mobile `tsconfig.json` extends `expo/
tsconfig.base`, which uses `moduleResolution: "bundler"`, lenient about
extensions in a way that doesn't match what Metro actually needs).
Every internal relative import in `apps/mobile` uses **no** extension
(`from "./apiClient"`) — confirmed by a full `expo export --platform
web` bundle succeeding cleanly (see 18.9).

### 18.3 Auth (`apps/mobile/auth/AuthContext.tsx`)

Same shape as the desktop's (section 6): access token in memory,
refresh token in `expo-secure-store`, silent boot-time resume, 401→
refresh→retry-once. `app/_layout.tsx` uses Expo Router's
`<Stack.Protected guard={...}>` (a real, supported feature of the
installed expo-router 57.0.20 — confirmed in the package source before
relying on it) to swap the entire screen set based on
`isAuthenticated`, rather than a per-screen guard component — a worker
never sees a login-screen flash or a bounce through a protected route.

### 18.4 Design system (`apps/mobile/components/ui.tsx` + `lib/theme.ts`)

Built fresh, not adapted from the desktop's dense-table CSS system
(wrong shape for this app entirely) and not the scaffold's `Themed.tsx`
light/dark pair (deleted — see 18.5). A **single light theme**
(`lib/theme.ts`'s doc comment explains why: a worker outdoors in
daylight needs contrast, not a theme toggle) built around a handful of
large, obvious primitives (`components/ui.tsx`): `BigButton` (56px+
touch target, per the brief's "large touch targets"), `TextField`,
`Pill` (status chips), `Card`, `ScreenLoading`/`ErrorBanner`/
`EmptyState`. Every screen in the app is built from these — no
per-screen bespoke buttons.

### 18.5 Navigation (Expo Router, `apps/mobile/app/`)

The session-1 scaffold's 3-tab layout (Today/Upcoming/Profile) was
**removed entirely** — see 18.6 for why "Upcoming" as a separate tab
didn't survive contact with the brief's actual screen list, and why
logout moved from a "Profile" tab into a one-line link on the Home
screen's header instead. Final structure: `login` (unauthenticated) →
`index` (Home/Today, the app's hub) → `visit/[id]/index` (Visit
Detail) → four screens pushed **from** Visit Detail as modals
(`presentation: "modal"`): `visit/[id]/photos`, `visit/[id]/
inspection`, `visit/[id]/treatment/[caseTreatmentId]`, `visit/[id]/
complete`. Navigation depth is never more than 2 (Home → Visit Detail
→ one modal) — matches the brief's explicit "minimal navigation depth".
Deleted as dead weight once the tabs were gone: `components/{Themed,
StyledText,useClientOnlyValue{,.web}}.tsx`, `constants/Colors.ts`, the
old `lib/api.ts` health-check-only wrapper, `components/
ConnectionBanner.tsx`.

### 18.6 Home / Today (`app/index.tsx`)

Exactly the brief's list — today's visits, next visit, overdue/
incomplete visits, simple status — nothing else. Three real queries
(`useMyVisitsQuery`, server-scoped to the worker automatically, 3.15):
today's date range (all statuses, so a done visit still shows as done
rather than vanishing), and two "overdue" queries (still-`SCHEDULED`
and still-`IN_PROGRESS` visits from *before* today, merged client-side
— same derived-section pattern as the desktop dashboard, section
17.6). "Prochaine visite" is computed as the earliest not-yet-done
visit across both sets — deliberately surfaces an overdue visit ahead
of a merely-upcoming one, since that's the more urgent thing to act on.
Pull-to-refresh (`RefreshControl`) for a manual retry when offline.
**A duplicate-rendering bug found and fixed this session**: the visit
shown as "Prochaine visite" was *also* being rendered a second time
inside the "Aujourd'hui" list below it (both draw from the same
`todayItems` query) — found while debugging an unrelated Playwright
test flake (18.9) that turned out to be caused by this exact
duplication (two "En cours" pills on screen, only one actually
visible). Fixed by filtering the next-visit's id out of the list
FlatList's own `data` (the section's *count* still reflects every visit
scheduled today — display-only dedup, not a data change).

### 18.7 Visit Detail (`app/visit/[id]/index.tsx`) — the hub screen

Everything the brief's Visit Detail section asks for: customer name +
tap-to-call phone (`Linking.openURL('tel:...')`), property/address,
problem description, scheduled time, assigned treatments (from `GET
/cases/:id`, fetched alongside the visit — a worker always has case
access here by construction, 3.15), and **previous relevant visits and
photos** (case's other visits, most recent first, capped at 5, each
with type/status/a one-line inspection summary and a thumbnail row of
that visit's own photos — deliberately compact, no admin/audit
information, matching the brief's "do not overwhelm the worker"). A
tapped photo thumbnail opens `components/PhotoLightbox.tsx` (a plain
RN `Modal`, no navigation route) for a full-screen look.

Actions gate on visit status: `SCHEDULED` shows only "Démarrer la
visite" (`POST /visits/:id/start`); once started, "Photos"/
"Observations" buttons and any case treatments become tappable
(pushing the four modal screens from 18.5), plus "Terminer la visite"
(pushes the review screen, 18.8's requirement); a closed visit
(`CANCELLED`/`NO_SHOW`) shows a one-line notice and no actions.

### 18.8 Photos, Inspection, Treatment, Complete Visit (the four modals)

- **`visit/[id]/photos.tsx`**: camera (`expo-image-picker`, primary
  button) or gallery, multiple photos, preview (tap → lightbox), delete
  before upload, optional per-photo caption (the backend has no
  edit/delete-after-upload endpoint, so getting the caption right
  *before* sending matters here more than on desktop — see 18's own
  file doc comment). Photos accumulate locally first (`status:
  "pending"`) rather than auto-uploading on capture — matches the
  brief's explicit ordering ("preview, delete before upload"). A single
  "Envoyer les photos (n)" button uploads every pending/failed photo
  **sequentially, not in parallel** (brief: "respect mobile network
  limitations" — a weak field connection shouldn't carry several
  simultaneous uploads), each with a live per-photo progress percentage
  and, on failure, a visible error + its own "Réessayer" button — never
  a silent failure, matching "do not fake successful uploads".
- **`visit/[id]/inspection.tsx`**: observations/condition/remarks,
  three fields, nothing else ("keep it fast" per the brief). Saves for
  real via `POST /visits/:id/inspection` independently of Complete
  Visit.
- **`visit/[id]/treatment/[caseTreatmentId].tsx`**: shows the catalog
  treatment's description/instructions/**safety information** (visually
  called out, warning-toned card — the brief's explicit ask), lets the
  worker add notes and mark it performed (`PATCH /cases/:id/
  treatments/:id`, the one write a worker is allowed on a case's
  treatments — see 3.15/case-treatments.service.ts's existing
  session-2 authorization).
- **`visit/[id]/complete.tsx`**: read-only review — the brief's
  explicit requirement ("before completing: photos, observations,
  remarks should be visible/reviewable") — then one confirm button
  (`POST /visits/:id/complete`). If any photo is still pending/failed
  when the worker taps complete, a warning lets them go finish sending
  it or complete anyway (never silently drops it — the local draft,
  18.8's next paragraph, still has it either way).

**Local draft persistence** (`lib/draftStore.ts`, `AsyncStorage`,
documented per-visit): observations/condition/remarks text and captured
photos' local URIs/captions/upload status are saved on every change,
keyed per visit id, and only cleared once the visit is actually
completed server-side. This is the brief's offline-considerations
minimum, deliberately **not** a full offline sync engine (explicitly
scoped out by the brief itself): a network failure or a backgrounded
app never loses typed text or a captured photo (it just sits as
"failed"/"pending", visibly, until the worker comes back to retry) —
but if the app is never reopened on that visit again, nothing
automatically retries in the background. Good enough for "don't lose
work", not a promise of eventual sync — the file's own doc comment says
exactly this, and where the line is.

### 18.9 Verification performed this session

- `pnpm -r typecheck` from repo root: all 4 packages clean (re-run
  after every fix below, not just once at the end).
- `pnpm --filter @msph/mobile exec expo export --platform web`: clean
  production bundle, all 9 routes resolve with no bundler errors.
- `pnpm --filter @msph/server test`: 36/36 still passing after the
  storage driver + CORP header changes.
- **A full Playwright-driven E2E run**, same rigor as the desktop's
  session-3 test (17.14) but for the actual mobile UI this time (no
  API call standing in for a screen that didn't exist yet): `expo
  start --web` serving the real app, a real worker login, then: Home
  screen shows the seeded visit under both "Prochaine visite" and
  "Aujourd'hui" (deduped, 18.6) → open it → confirm customer/phone/
  property/problem visible → "Démarrer la visite" → status flips to
  "En cours" → open the case's assigned treatment → confirm
  instructions + safety information both visible → add notes, mark
  performed → back on Visit Detail, treatment shows "Effectué" →
  Observations screen → fill and save all three fields → back on Visit
  Detail, button shows a saved checkmark → Photos screen → pick a real
  file via Playwright's file-chooser interception (the closest a
  headless-browser E2E can get to "camera capture" — see 3.14 for why
  the client's upload code had to grow a web transport at all) → "En
  attente d'envoi" → tap send → **poll until "✓ Envoyée"**, i.e. the
  server actually confirmed the upload (not a fake/optimistic
  success) → back on Visit Detail, photo count updates → "Terminer la
  visite" → review screen shows the exact observations/condition/
  remarks/photos just entered → confirm → visit completes. All 15
  steps passed, zero console errors, on the final run.
- **Cross-checked from the manager's side**: after the mobile run, the
  desktop app (Vite dev server, real login, navigated straight to the
  same case) was screenshotted showing: case status "En cours",
  workflow stepper advanced through Inspection/Traitement to Suivi, the
  visit card "Terminée" with the worker's exact inspection text, the
  treatment "Effectué" with the worker's exact notes, and a photo
  attached — i.e. `apps/desktop`'s existing session-3 rendering of
  `CaseWithRelations` (section 17.10) needed **zero changes** to show
  the mobile session's work correctly, because both clients read the
  same API. This is the brief's "the manager should see these changes
  in the desktop app" requirement, verified visually, not assumed.
- A real photo, uploaded through the actual UI, confirmed on disk
  (`apps/server/storage/uploads/`) and re-fetchable over HTTP — not a
  mocked network layer.

### 18.10 Bugs found and fixed this session

- **Home screen duplicate visit rendering** — 18.6.
- **`Cross-Origin-Resource-Policy: same-origin` blocking photo loads
  cross-origin** — section 5's dedicated writeup; found via the E2E
  test's photo thumbnails failing, not by inspection.
- **A React Native invariant crash**: `photo.caption && <Text>...` in
  the photo list — when `caption` is `""` (a fresh photo's initial
  draft value, not `null`), JS's `&&` returns the empty string itself
  rather than `false`, and React Native (unlike plain DOM) throws
  "Unexpected text node… cannot be a child of a `<View>`" for a raw
  string child — this actually crashed the Photos screen mid-upload in
  this session's own testing (the upload succeeded server-side but the
  UI never updated to show it, because the crash happened exactly when
  the photo's status flipped and the caption-render branch was hit).
  Fixed by switching the falsy-string checks to an explicit ternary
  (`photo.caption ? <Text>… : null`) everywhere this pattern appeared
  with a possibly-empty-string (not just possibly-`null`) value.
- **`expo-file-system`'s `UploadTask` has no web implementation** —
  not fixable (native module gap in the library itself, confirmed by
  reading its package source), *worked around* per 3.14 by adding an
  `XMLHttpRequest`-based upload transport for `Platform.OS === "web"`
  so this sandbox's E2E testing (and any future web deployment of this
  Expo project) has a real, working upload path too.
- **Server login rate-limiting hit during repeated manual E2E test
  runs** (`authRateLimiter`, 20 requests/15 min/IP, session 2) — not a
  product bug, just a reminder that repeated scripted logins against a
  long-running dev server will eventually 429; resolved by restarting
  the dev server (resets the in-memory limiter) between heavy test
  iterations, not by weakening the limiter.

## 19. Next steps (recommended order for the next session)

1. **Storage driver hardening**: the desktop's "Ajouter une photo" form
   still uses the metadata-only `POST /visits/:id/photos` endpoint (a
   manual storageKey reference) rather than the new real upload endpoint
   (section 5) — give it a real file picker against `POST /visits/:id/
   photos/upload` instead, for parity with mobile.
2. **Socket.IO auth** — connections are currently unauthenticated (noted
   in both apps' `socket.ts` doc comments). Low priority while the
   payloads stay minimal (`{caseId}`/`{caseId, visitId}`, no sensitive
   data), but worth closing before this ships beyond internal use.
3. **ESLint/Prettier** — carried over from sessions 1-3, still not done.
4. **Electron packaging** (`electron-builder`) for distributable
   installers, and an Expo/EAS build for the mobile app's real iOS/
   Android binaries — nothing done here yet, dev-mode only for both.
   This session's mobile verification (18.9) was necessarily
   web-platform-only (no physical device/emulator in this sandbox) —
   a real device pass (camera via `expo-image-picker`'s native path,
   `UploadTask`'s native transport rather than the web XHR fallback,
   push notification feasibility for realtime) is the highest-value
   thing to do before this ships to actual field workers.
5. Eventually: S3/R2 storage driver, email ingestion, an `OWNER` role
   tier if the business ever needs one (3.2), a real accessibility pass
   on desktop's `SearchSelect`/`Modal`/`Drawer` (currently
   mouse-driven), hoisting French labels into `packages/shared` now
   that both real clients need them (3.13), a background sync queue for
   mobile if offline usage patterns turn out to need more than the
   current "don't lose the draft, retry visibly" approach (18.8).
6. Smaller polish, not urgent: the desktop cases list's "last activity"
   column could use a real per-case last-activity timestamp if a cheap
   backend query for it ever gets added (17.8); desktop list pages cap
   at 100 with no further pagination (fine at this company's scale);
   mobile's logout confirmation uses `Alert.alert`, which is a no-op on
   `react-native-web` (fine on real native — just not exercisable in a
   browser-based E2E, see 18.9's own scope note).

## 20. Commands reference

```bash
# Install everything (run from repo root)
pnpm install

# First-time DB setup
pnpm --filter @msph/server prisma:migrate
pnpm --filter @msph/server prisma:seed

# Test DB (one-time, separate from the dev DB)
psql -c "CREATE DATABASE msph_test OWNER msph;"
DATABASE_URL="postgresql://msph:msph_dev_password@localhost:5432/msph_test?schema=public" \
  pnpm --filter @msph/server exec prisma migrate deploy

# Dev servers
pnpm dev:server      # http://localhost:4000, health at /api/health
pnpm dev:desktop     # Electron + Vite (or just `pnpm --filter @msph/desktop exec vite`
                     # for the renderer alone in a browser tab, useful for quick checks)
pnpm dev:mobile      # Expo — scan QR or press w/a/i in the terminal, or:
EXPO_PUBLIC_API_BASE_URL=http://localhost:4000/api \
EXPO_PUBLIC_SOCKET_URL=http://localhost:4000 \
  pnpm --filter @msph/mobile exec expo start --web --port 8081
                     # web platform (react-native-web) — no device/emulator
                     # needed, how this session's own E2E testing ran (18.9).
                     # Add http://localhost:8081 to the server's
                     # CLIENT_ORIGIN (.env, comma-separated) or every
                     # request 400s on CORS.

# Checks
pnpm typecheck                                   # every package
pnpm --filter @msph/server test                  # backend test suite
pnpm --filter @msph/server prisma:studio         # DB browser GUI
pnpm --filter @msph/desktop build                # production build check (Vite + both Electron tsc passes)
pnpm --filter @msph/mobile exec expo export --platform web   # bundle check

# Local Postgres in THIS dev container (already created)
service postgresql start
# role: msph / msph_dev_password, dbs: msph_dev, msph_test

# Default logins (seeded)
# admin@msph.local / ChangeMe123!  (ADMIN)
# worker@msph.local / ChangeMe123! (WORKER)
```

## 21. Environment variables

See `.env.example` at repo root for the full documented server list —
copy it to `apps/server/.env` and fill in real values. Never commit
`.env` files (already gitignored) or hardcode secrets in code.

Desktop-specific (optional, both have sane localhost defaults — see
`apps/desktop/src/vite-env.d.ts`):

- `VITE_API_BASE_URL` — defaults to `http://localhost:4000/api`.
- `VITE_SOCKET_URL` — defaults to `VITE_API_BASE_URL` with the trailing
  `/api` stripped.

Set these via a `.env` file in `apps/desktop/` (Vite's standard
mechanism) if the server ever runs somewhere other than localhost:4000.

Mobile-specific (optional, same defaults — see `apps/mobile/lib/
apiClient.ts` / `lib/socket.ts`):

- `EXPO_PUBLIC_API_BASE_URL` — defaults to `http://localhost:4000/api`.
  **Must be a LAN IP, not `localhost`, when testing with Expo Go on a
  physical device** — `localhost` on the phone resolves to the phone
  itself, not the dev machine.
- `EXPO_PUBLIC_SOCKET_URL` — defaults to `EXPO_PUBLIC_API_BASE_URL` with
  the trailing `/api` stripped.

Set these in the shell before `expo start` (Expo's `EXPO_PUBLIC_*`
convention — no `.env` loader needed for local dev) or in an `apps/
mobile/.env` file (Expo also reads that automatically).

Remember to add whatever origin actually serves a browser-based client
(the desktop's `:5173`, mobile web's `:8081`, ...) to the server's own
`CLIENT_ORIGIN` (comma-separated, see `.env.example`) — native mobile
fetch (a real device/emulator, not web) sends no `Origin` header and is
unaffected by this.
