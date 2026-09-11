# CONTEXT.md — MSPH Project Memory

**Read this file completely at the start of every session.** It is the
persistent memory of the project. Do not redo completed work — check
"Current status" and "Next steps" first and continue from there.

Last updated: 2026-09-11 (session 3 — desktop application: full French UI
wired to the real API, realtime, Electron security).

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
  **Expo Router** (file-based routing). Worker field app. **Still
  placeholder screens** — not touched this session, not in scope (the task
  was specifically the desktop app). Next session's job if picked up.
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

**Not done**: Socket.IO connections aren't authenticated (see 17.7); the
mobile app doesn't connect at all yet (it doesn't exist as a real app —
still session-1 placeholders).

## 5. File storage — still just the abstraction boundary, no driver yet

Unchanged from session 1/2: `STORAGE_DRIVER=local` env var exists and is
validated at boot, `/uploads` is statically served, but there is still no
`src/storage/` module and no binary upload endpoint.
`POST /visits/:id/photos` is metadata-only. **Session 3's desktop
"Ajouter une photo" form is honest about this** — it asks for a text
"référence du fichier" and says outright, in French, that real file
storage isn't available yet, rather than presenting a fake "choose file"
button that doesn't actually upload anything.
See `apps/desktop/src/pages/cases/AddPhotoModal.tsx`.

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
  section 18 "Commands reference" below for setup.
- No ESLint/Prettier anywhere in the repo yet (carried over, still not
  done — see Next steps).

## 17. Desktop application (session 3 — this session)

The task: build the first serious version of the desktop app, fully in
French, professional/dense/operational styling, wired to the real API
(no mocking), with realtime and Electron security best practices. Done —
see section 19 for the verification evidence.

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

## 18. Next steps (recommended order for the next session)

1. **Mobile app** — same treatment as this session but for
   `apps/mobile`: real login (`expo-secure-store` for the refresh token,
   not `AsyncStorage`), Today/Upcoming screens from `GET /visits`, visit
   detail wired to start/complete/inspection/photos, camera capture once
   the storage driver (next item) exists. Once mobile is real, redo the
   17.14 E2E scenario using the actual mobile UI instead of a raw API
   call standing in for it.
2. **Storage driver** (section 5): `apps/server/src/storage/` (a
   `StorageDriver` interface + `LocalStorageDriver`), a real multipart
   upload endpoint, then wire both the desktop's `AddPhotoModal` and
   mobile's camera capture to it instead of the current
   type-a-reference-by-hand placeholder.
3. **Socket.IO auth** — connections are currently unauthenticated (noted
   in `socket.ts`'s doc comment). Low priority while the payloads stay
   minimal (`{caseId}`/`{caseId, visitId}`, no sensitive data), but worth
   closing before this ships beyond internal use.
4. **ESLint/Prettier** — carried over from sessions 1-2, still not done.
5. **Electron packaging** (`electron-builder`) for distributable
   installers — nothing done here yet, dev-mode only.
6. Eventually: S3/R2 storage driver, email ingestion, an `OWNER` role
   tier if the business ever needs one (3.2), a real accessibility pass
   on `SearchSelect`/`Modal`/`Drawer` (currently mouse-driven, functional
   but not keyboard-exhaustive beyond Escape-to-close).
7. Smaller desktop polish worth a look next time, not urgent: the cases
   list's "last activity" column could use a real per-case last-activity
   timestamp if a cheap backend query for it ever gets added (see
   17.8's honesty note about `Case.updatedAt` being an approximation);
   pagination controls on Customers/Properties/Treatments/Intervenants
   pages currently just load up to 100 and don't paginate further (fine
   at this company's scale, revisit if that stops being true).

## 19. Commands reference

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
pnpm dev:mobile      # Expo — scan QR or press w/a/i in the terminal

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

## 20. Environment variables

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
