# CONTEXT.md — MSPH Project Memory

**Read this file completely at the start of every session.** It is the
persistent memory of the project. Do not redo completed work — check
"Current status" and "Next steps" first and continue from there.

Last updated: 2026-09-11 (session 7 — production deployment readiness:
diagnosed and fixed the root cause of the mobile app's "Server
unreachable" error — both clients had an *unconditional* `?? "http://
localhost:4000/api"` fallback, used in dev AND production alike, with no
`.env` file ever present in `apps/mobile/`, so a real device (physical
phone, Android emulator) always tried to reach itself; built a shared
dev-vs-production API-URL config module (`packages/shared/src/config`)
used identically by both clients, which now *fails loudly* with a clear
on-screen message in a production build with no URL configured, instead
of silently trying localhost. Also: backend production hardening (trust
proxy, a packaged-Electron-safe CORS fix, real graceful shutdown, a
Dockerfile), an S3-compatible storage driver alongside the local one,
electron-builder Windows packaging (built + launched a real package this
session), EAS mobile build configuration, and three GitHub Actions
workflows. See §21 for the full findings, what was actually verified by
running it versus what still needs real credentials/a real server this
sandbox doesn't have, and exact next steps. Previous: session 6 —
production-readiness audit: a 19-dimension review of auth, authorization,
validation, DB integrity, photo upload, realtime, both clients' UX,
security, logging, env config, tests, TypeScript, accessibility and
performance. Found and fixed one real bug — `completeVisit` had no guard
against re-completing an already-completed visit — with a regression
test; rewrote README.md into a real onboarding doc. See §20. Session 5 —
cross-client synchronization: a granular Socket.IO event taxonomy
replacing the old 4-event "everything changed" design, a committed
server-side realtime test suite, and a 13-step live desktop+mobile
Playwright verification. Session 4 — mobile application: full French
worker app wired to the real API, real photo upload + storage driver,
realtime, offline-safe drafts. Session 3 — desktop application: full
French UI wired to the real API, realtime, Electron security.

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

### 3.16 Realtime events emit after the transaction commits, never inside it (session 5)

Every socket event this session added follows the same rule: the
service function computes what happened (including whether
`Case.status` actually changed, via `case-status.ts`'s now-non-`void`
return — see section 4.4) *inside* its Prisma transaction, but the
**route handler**, after `await`-ing the service call (transaction
already committed), decides which `emitXxx()` call(s) to make. No
`emitXxx()` call exists inside a `prisma.$transaction(...)` callback
anywhere in the codebase. **Why**: a transaction can still roll back
after its callback runs (a later statement in the same transaction
throws) — emitting from inside it would risk telling every connected
client about a change that the database itself then discards. This
was a deliberate design constraint from the start of the refactor, not
a bug found and fixed — see section 4 for the full event architecture
this enabled, and section 19 for the session's build log.

### 3.17 No optimistic UI anywhere, on either client (session 5, confirmed)

Checked as part of this session's "never treat local UI state as
authoritative" focus: neither `apps/desktop` nor `apps/mobile` updates
what the user sees before the server responds to a mutation — every
`useMutation` renders its loading/pending state and waits for the real
response (or a realtime-triggered refetch) rather than assuming success
and patching the local cache first. This was already true from sessions
3-4 (not a change made this session) — recorded here because it's the
precondition that makes the "backend is authoritative, clients refetch"
rule in section 4.1 actually hold in practice, and worth confirming
explicitly rather than assuming, given this session's specific focus on
data consistency.

## 4. Realtime design (Socket.IO) — event architecture (session 5 rewrite)

This section is the canonical reference for the realtime contract.
Sessions 2-4 built a working but coarse version (four events: case/visit
created/updated). **Session 5's whole focus was synchronization** — it
replaced that with a granular event taxonomy, fixed a real bug the old
design had (`scheduleVisit` emitted `VISIT_UPDATED` for a brand-new
visit), and added a committed, repeatable test suite plus a live
cross-client verification. See section 19 for the full session-5 build
log, bugs found, and test results — this section documents the resulting
*design*, kept current rather than a session-by-session diff.

### 4.1 The single source of truth

**PostgreSQL, via the Express API, is the only source of truth.**
Neither desktop nor mobile ever treats its own local UI state as
authoritative. Concretely:

- Every mutation goes through a normal REST call (`POST`/`PATCH`/
  `DELETE`), handled by a service function inside a Prisma transaction.
  A mutation's HTTP response is itself already-fresh, authoritative data
  — react-query's mutation `onSuccess`/`invalidate` handling never needs
  to guess what changed.
- A Socket.IO event is **only a hint that something changed**, carrying
  ids (and, where useful, a small enum like a status) — **never** a full
  record. See `packages/shared/src/constants/index.ts`'s payload
  interfaces (`CaseEventPayload`, `VisitEventPayload`,
  `CaseStatusChangedPayload`, etc.) — every one of them is `{caseId}`,
  `{caseId, visitId}`, or a couple of ids plus one small field.
- On receiving an event, both `RealtimeProvider`s (desktop and mobile)
  call `queryClient.invalidateQueries(...)` — **they never patch the
  cache by hand from the payload**. react-query then refetches from the
  real API the next time the relevant query is observed, and the
  server's own authorization (worker-scoped `assignedWorkerId` filtering,
  `assertCaseAccess`/`assertVisitAccess`) decides what actually comes
  back. This is what makes "avoid duplicated conflicting state" hold: a
  client's cache is always either the last real server response, or
  explicitly stale-and-about-to-refetch — never a hand-reconstructed
  guess that could drift from the database.
- Client-side optimistic UI is deliberately **not** used anywhere in this
  codebase (checked as of session 5) — every mutation waits for the
  server response before updating what the user sees. Slower than
  optimistic updates, but it means there is no client-side reconciliation
  logic to get wrong, and no window where two clients could show
  contradictory "optimistic" states.

### 4.2 Event taxonomy

`packages/shared/src/constants/index.ts`'s `SOCKET_EVENTS` (session 5):

```
Case lifecycle:   CASE_CREATED, CASE_UPDATED, CASE_STATUS_CHANGED, CASE_RESOLVED
Visit lifecycle:  VISIT_CREATED, VISIT_UPDATED, VISIT_ASSIGNED, VISIT_STARTED, VISIT_COMPLETED
Inspection/photo: INSPECTION_CREATED, PHOTO_ADDED
Treatments:       TREATMENT_ADDED, TREATMENT_UPDATED, TREATMENT_REMOVED
Room housekeeping (client -> server): JOIN_CASE_ROOM, LEAVE_CASE_ROOM
```

`CASE_UPDATED`/`VISIT_UPDATED` are the **honest catch-all** for an edit
that doesn't fit a more specific bucket (e.g. an admin editing
`problemDescription`/`priority`, or rescheduling a visit's time/notes) —
they are never used as a substitute for a more specific event when one
applies (a status change always fires `CASE_STATUS_CHANGED`, never
`CASE_UPDATED` too — see 4.4's exact per-action mapping). Every payload
type is defined in the same file as `SocketEventPayloadMap`, so both the
server's emit call sites and each client's `.on()` handlers are
type-checked against the same contract — a payload-shape typo is a
compile error, not a runtime surprise.

### 4.3 Rooms (unchanged design, session 3's 3.12 bug fix still holds)

Every connected socket joins a global `"cases"` room on connect (Socket
.IO isn't authenticated yet, see 4.6 — there's no per-user room to scope
to, and every open screen plausibly wants to know a case changed), plus
an opt-in `case:${caseId}` room while a case detail screen is open
(`JOIN_CASE_ROOM`/`LEAVE_CASE_ROOM`). **Every event broadcasts to both
rooms** (`apps/server/src/realtime/socket.ts`'s `broadcast()` helper) —
room membership is a convenience for a client to `.on()` fewer duplicate
deliveries in the future if it ever needs to, not something the current
clients rely on for correctness (both just listen globally after
connecting).

### 4.4 Server: what triggers what (the exact mapping)

`apps/server/src/realtime/socket.ts` exports one `emitXxx()` helper per
event. Each route handler calls the specific helper(s) that describe
what actually happened, based on what its service function reports:

| Action (route) | Event(s) emitted |
|---|---|
| `POST /cases` | `CASE_CREATED`; if `initialVisitScheduledAt` was given: `VISIT_CREATED`, and `VISIT_ASSIGNED` if a worker was given; `CASE_STATUS_CHANGED` if that pushed the case out of `NEW` |
| `PATCH /cases/:id` | `CASE_STATUS_CHANGED` (+`CASE_RESOLVED` if the new status is `RESOLVED`) if `status` changed; otherwise `CASE_UPDATED` |
| `POST /visits` (schedule) | `VISIT_CREATED`; `VISIT_ASSIGNED` if a worker was given; `CASE_STATUS_CHANGED` if the case's derived status changed |
| `PATCH /visits/:id` (reschedule/reassign/cancel) | `VISIT_ASSIGNED` if `assignedWorkerId` changed; otherwise `VISIT_UPDATED`; plus `CASE_STATUS_CHANGED` if relevant |
| `POST /visits/:id/start` | `VISIT_STARTED`; `CASE_STATUS_CHANGED` if relevant (rare — see 4.5) |
| `POST /visits/:id/complete` | `INSPECTION_CREATED` if observations/condition/remarks were included in the same call; `VISIT_COMPLETED`; `CASE_STATUS_CHANGED` if relevant (typical — completing a visit usually moves `SCHEDULED` -> `IN_PROGRESS`) |
| `POST /visits/:id/inspection` | `INSPECTION_CREATED` |
| `POST /visits/:id/photos` and `/photos/upload` | `PHOTO_ADDED` |
| `POST /cases/:id/treatments` | `TREATMENT_ADDED` |
| `PATCH /cases/:id/treatments/:id` | `TREATMENT_UPDATED` |
| `DELETE /cases/:id/treatments/:id` | `TREATMENT_REMOVED` |

**How the server knows precisely** (session 5's actual refactor, not
just new emit calls): `case-status.ts`'s `recalculateCaseStatus` and
`applyExplicitStatus` — previously `void`-returning — now return
`{from, to} | null` (`null` = no actual change). Every visits/cases
service function that calls them (`scheduleVisit`, `updateVisit`,
`startVisit`, `completeVisit`, `updateCase`) threads that result back up
to its own return value (e.g. `ScheduleVisitResult { visit,
statusChange }`), so the **route handler** — running *after* the Prisma
transaction has committed — decides exactly which event(s) to emit from
real, already-committed facts. Emitting *inside* the transaction was
deliberately avoided: a socket event for a change that then rolls back
would tell clients about something that never actually happened.

### 4.5 A genuinely-tested nuance: derived case status doesn't over-fire

`Case.status` is derived from visit history (3.1), not set directly
except by an explicit admin action. A consequence proven by the session-5
test suite (not assumed): starting a visit on a case that's already
`SCHEDULED` (because that same visit already counted as "active") does
**not** emit a spurious `CASE_STATUS_CHANGED` — `recalculateCaseStatus`
correctly returns `null` because the derived bucket didn't move.
Scheduling a second active visit (e.g. a follow-up on an `IN_PROGRESS`
case) is the same story. Only a transition that actually crosses a
bucket boundary (`NEW`->`SCHEDULED`, `SCHEDULED`/`NEW`->`IN_PROGRESS`, or
an explicit resolve/cancel/reopen) fires the event — see
`apps/server/tests/realtime.test.ts` for the exact assertions.

### 4.6 Clients

- `apps/desktop/src/realtime/RealtimeProvider.tsx` / `apps/mobile/
  realtime/RealtimeProvider.tsx` — mounted once near each app's root.
  Both connect the shared socket on login, disconnect on logout, and
  `.on()` the full event set, each mapping every event to an
  `invalidateQueries()` call via two small helpers (`invalidateCase`,
  `invalidateVisit`) — see each file's own doc comment for *why* nearly
  every specific event still resolves to the same couple of
  invalidations today (the desktop's `GET /cases/:id` already embeds
  visits/photos/treatments/activities, so *which* event fired doesn't
  change *what* gets refetched — the taxonomy's value is in the emit-side
  precision and the test suite that pins it, not in each client needing
  bespoke per-event refetch logic yet).
- Mobile deliberately does **not** listen for `CASE_CREATED` (a worker
  has no visits on a just-created case yet, so it can't affect "my
  visits today") — see the file's own comment. Desktop listens to
  everything, since any of it can affect a manager's dashboard/lists.
- `apps/desktop/src/realtime/useCaseRoom.ts` — joins `case:${id}` while
  `CaseDetailPage` is mounted, leaves on unmount (4.3).
- Both `lib/socket.ts` files: one shared `socket.io-client` connection,
  connected on login, disconnected on logout — not per-screen.

### 4.7 Not done

Socket.IO connections still aren't authenticated (unchanged since
session 3 — noted in both `socket.ts` files' doc comments as a gap, not
silently ignored). Low priority while every payload stays minimal (ids +
one small field, no sensitive data) and every client's actual data
access still goes through the authenticated, authorized REST API
regardless of which events it happened to receive — but worth closing
before this ships beyond internal use (see "Next steps").

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
  section 24 "Commands reference" below for setup.
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

## 19. Cross-client synchronization (session 5 — this session)

The task: focus specifically on synchronization between desktop, mobile,
backend, and the database, with the backend/database as the single
source of truth — design a meaningful event taxonomy (not one generic
"everything changed" event), verify it with a realistic end-to-end
scenario across both real clients, and fix any synchronization problems
found. Event architecture and synchronization rules are documented in
section 4 (kept as the living reference, not duplicated here) — this
section is the session's build log, test results, and limitations.

### 19.1 What was actually wrong before this session

Not a rewrite of something broken end-to-end — sessions 3-4 already
proved realtime worked (desktop updates live, mobile connects). But the
event design itself was coarse and had one real bug:

- Only 4 events existed (`CASE_CREATED/UPDATED`, `VISIT_CREATED/
  UPDATED`) — a client couldn't tell "a visit was started" from "a visit
  was rescheduled" from "an admin renamed a customer's problem
  description" without refetching and diffing itself.
- **A real bug, not hypothetical**: `POST /visits` (scheduling a new
  visit) emitted `VISIT_UPDATED`, not `VISIT_CREATED` — because at the
  time only those two visit events existed and "updated" was used as the
  catch-all. Functionally harmless (both triggered the same
  invalidation), but semantically wrong and exactly the kind of thing
  that becomes a real bug the moment a client wants to react
  specifically to "a new visit appeared" (e.g. a push notification, or
  Scenario 2's "worker receives VISIT_ASSIGNED" requirement) rather than
  refetch-and-diff. Fixed as part of the taxonomy work (see section 4.4's
  table).
- `POST /visits/:id/inspection` (standalone inspection recording) and
  both photo endpoints emitted **nothing at all** — a worker recording an
  inspection or adding a photo without also completing the visit in the
  same call produced no realtime signal whatsoever. Also fixed.
- Case-treatment actions (add/update/remove) all emitted the same
  generic `CASE_UPDATED` — no way to tell "a treatment was added" from
  "a treatment was marked performed" from "the case's priority changed".

### 19.2 The refactor

Covered in full in section 4 (the living reference) — summary: `case-
status.ts`'s two status-mutating functions now return `{from, to} |
null` instead of `void`; every cases/visits service function that calls
them threads that result up to its own return value; every route handler
picks the exact emit call(s) that describe what happened, using data the
service already computed (never re-deriving "did anything change" at the
route layer). `packages/shared`'s `SOCKET_EVENTS` grew from 6 to 16
entries (including room housekeeping) with a typed `SocketEventPayloadMap`
pinning every payload shape.

### 19.3 Automated realtime test suite (new, committed)

`apps/server/tests/realtime.test.ts` — the one test file in the suite
that boots a **real** `http.Server` + `initSocket()` + a real
`socket.io-client` connection (every other test file calls `createApp()`
directly via supertest, no live socket — see `tests/helpers.ts`'s doc
comment). Walks the brief's full manager+worker scenario end to end
through the real HTTP routes and asserts the **exact** event name and
payload fired at each step — not "some event fired", the precise
`{event, payload}` pair, including negative assertions (e.g. starting an
already-`SCHEDULED` case's first visit must **not** emit
`CASE_STATUS_CHANGED`; completing a visit with no inspection fields must
**not** emit `INSPECTION_CREATED`). Also covers a no-op case edit
(confirms `CASE_UPDATED` fires, not `CASE_STATUS_CHANGED`) and
`TREATMENT_REMOVED`. 4 tests, all passing, folded into the normal
`pnpm --filter @msph/server test` run (40/40 total after this session,
up from 36 — no existing test needed changes, the service-layer return
type changes were additive).

This is the repeatable, CI-friendly counterpart to the live cross-client
verification below — it proves the *server* emits correctly, independent
of any particular UI, and it'll catch a regression automatically on a
future session even if nobody re-runs a full Playwright pass.

### 19.4 Live cross-client verification (13 steps, both real UIs)

A Playwright script drove **two live browser pages at once** — the real
desktop app (Vite dev server) and the real mobile app (`expo start
--web`) — both logged in and left open, with the manager and worker
actions interleaved so each step could assert the *other* client updated
**without any reload or manual refresh**:

1. [Desktop] Create customer + case + schedule initial consultation
   assigned to a worker.
2. [Mobile, already sitting on Home, untouched since login] The new visit
   appears — live.
3. [Mobile] Open it, tap "Démarrer la visite". [Desktop, still on the
   case detail page from step 1] Status flips to "En cours" — live.
4. [Desktop] Choose a treatment **while the worker's visit is still in
   progress**. [Mobile, still on the same Visit Detail screen, never
   navigated away] The "Traitements du dossier" section appears with the
   new treatment — live (this specifically proves `TREATMENT_ADDED`
   reaching a screen deep in another client's navigation stack, not just
   a list screen).
5. [Mobile] Record observations (Inspection screen).
6. [Mobile] Capture and really upload a photo (polled until the server
   confirmed it — not an optimistic/fake success).
7. [Mobile] Mark the treatment performed. [Desktop] Shows "Effectué" —
   live (`TREATMENT_UPDATED`).
8. [Mobile] Complete the visit. [Desktop] Shows the visit "Terminée" with
   the worker's *exact* inspection text and the photo — live
   (`VISIT_COMPLETED`, `INSPECTION_CREATED`).
9. [Desktop] Schedule a follow-up visit, assigned to the same worker.
10. [Mobile, still on Home] The follow-up (type "Suivi") appears — live
    (`VISIT_CREATED`/`VISIT_ASSIGNED` reaching a screen the worker never
    left or refreshed since step 2).
11. [Mobile] Start and complete the follow-up (no inspection fields this
    time — the negative case). [Desktop] Shows both visits, live.
12. [Desktop] Mark the case resolved.
13. [Mobile] Open a visit on the now-resolved case — shows a "Ce dossier
    a été marqué résolu" banner, live (`CASE_RESOLVED` reaching mobile).

**All 13 steps passed.** This directly satisfies the brief's Scenarios
1-6 and its numbered test scenario (manager creates customer/case/
consultation/assigns worker -> worker receives/starts/inspects/uploads
photos/completes -> manager sees inspection/selects treatment/schedules
follow-up -> worker receives/completes follow-up -> manager resolves),
driven through the real UIs rather than simulated at the API layer (a
step forward from session 3's E2E, which had to simulate the mobile side
via raw API calls because the mobile app didn't exist yet).

### 19.5 A real, small product gap this verification found and fixed

Scenario 6 asks that "both applications display RESOLVED". Desktop
already did (the case header badge). **Mobile did not** — it has no
case-level status indicator anywhere (deliberate, per session 4: a
visit-focused app, not a case-administration one). A worker opening a
visit on a since-resolved case would see nothing telling them so. Fixed
with a small, targeted addition: `apps/mobile/app/visit/[id]/index.tsx`
now shows a banner ("Ce dossier a été marqué résolu" / "... a été
annulé") when the case is in a terminal state — needs no new realtime
wiring, it just reads `kase.status` from the same `cases.detail(caseId)`
query the screen's other realtime-driven content already uses, so it
updates live for free.

### 19.6 Debugging notes: two false leads, for the next session's sanity

Both looked like real synchronization bugs at first and were not —
recorded here so a future session doesn't waste time re-diagnosing them:

- **A React Navigation stack quirk on web, not a sync bug**: after
  `router.replace("/")` (used throughout the mobile app to return to
  Home), the screen(s) navigated away from can remain mounted-but-hidden
  in the DOM rather than fully unmounting, and — because they're still
  subscribed to the same react-query cache — they keep reactively
  updating with new data exactly like the visible screen does. A
  Playwright locator matching by text alone can therefore find multiple
  elements, one hidden and stale-*looking* (though not actually stale
  data-wise) and one real; the hidden one consistently mounts *earlier*
  in DOM order. Every locator in the cross-client script that runs after
  any mobile navigation uses `.last()` rather than the first match (or
  Playwright's un-scoped `waitForSelector`, which silently proceeds with
  the first match) for exactly this reason. Whether this also has any
  real-device performance/memory implication (vs. iOS/Android's native
  stack navigators, which typically unmount more aggressively) is
  untested — flagged in "Next steps", not fixed, since it never produced
  incorrect *data*, only a test-selector ambiguity.
- **A test script bug that looked like a missing event**: the live
  script's follow-up-visit step initially forgot to select a worker in
  desktop's "Planifier une visite" modal (unlike the New Case page,
  scheduling a follow-up does **not** inherit the previous visit's
  worker — a deliberate explicit-choice-each-time design, not a bug).
  The visit was created correctly (real `VISIT_CREATED`, no assigned
  worker), so it correctly never reached the worker's mobile Home list —
  which briefly looked like a missing `VISIT_ASSIGNED` delivery. It
  wasn't; the visit genuinely had no assignee. Fixed the script, not the
  app.

### 19.7 Known limitations (honest, not papered over)

- **Socket.IO still isn't authenticated** (4.7) — unchanged from
  sessions 3-4, still low-priority while payloads carry only ids.
- **Events fire on any accepted mutation call, not gated on an actual
  diff** for a couple of edges: a `PATCH /cases/:id` that changes nothing
  (e.g. re-submitting the same `priority`) still emits `CASE_UPDATED` —
  pre-existing behavior from session 2, confirmed still true (and
  explicitly tested — 19.3's "no-op case edit" test) rather than
  silently assumed away. Harmless (an extra invalidation just triggers a
  refetch that returns identical data) but worth knowing before treating
  "an event fired" as proof "something changed".
- **No dedicated E2E test for the realtime *client* side** (only the
  server's emit contract has a committed automated test, 19.3) — the
  13-step cross-client run (19.4) is real and thorough but, like
  sessions 3-4's own E2E work, an ephemeral manual verification, not a
  committed, CI-runnable test. A future session could port it to a
  committed Playwright suite if the project acquires CI infrastructure
  that can run two dev servers + a browser.
- **The mounted-but-hidden navigated-away-screen behavior** (19.6) is
  understood as a testing gotcha, not confirmed harmless or harmful on a
  real device — worth a real-device pass to check.

## 20. Production-readiness audit (session 6)

Scope: not a feature session. The brief was explicit — audit the existing
system across 19 dimensions (auth, authz, API validation, DB integrity,
error handling, photo upload reliability, realtime sync, desktop UX,
mobile UX, loading/empty states, network failures, security, logging, env
config, tests, TypeScript quality, accessibility, performance) and fix
real reliability bugs, especially on failure paths that had never been
exercised in sessions 1-5 (every prior E2E verification tested the happy
path only). No decorative UI changes, no new features.

**20.1 Method.** Read every backend auth/authz/error-handling/validation
module, the Prisma schema, the photo upload pipeline (route → service →
`StorageDriver`), both clients' API-client layers (401/refresh handling,
network-vs-server-error distinction), both clients' realtime providers,
and a representative sample of desktop/mobile screens for
loading/empty/error-state coverage. Cross-checked each of the brief's nine
example failure scenarios against the actual code path, not just against
what earlier sessions' CONTEXT.md entries claimed was handled.

**20.2 Finding: `completeVisit` had no re-completion guard (real bug,
fixed).** `startVisit` (`apps/server/src/modules/visits/visits.service.ts`)
already rejected starting a visit that was `COMPLETED` or `CANCELLED`.
`completeVisit` only rejected `CANCELLED` — a visit already `COMPLETED`
could be "completed" again without error. Concretely this is the brief's
own "duplicate submission" and "visit completed twice" scenarios: a
dropped response on a flaky connection (mobile's `NetworkError` vs.
`ApiRequestError` distinction exists precisely because this happens) or a
double-tap that raced the button's `loading`-disabled state would silently
re-run the whole completion — overwriting `completedAt` with a new
timestamp, duplicating `VISIT_COMPLETED` and `INSPECTION_RECORDED`
`CaseActivity` rows in the case timeline every retry, and re-broadcasting
Socket.IO events. Fixed by making a re-completion an idempotent no-op: if
`visit.status === "COMPLETED"` already, `completeVisit` returns without
writing, logging, or recalculating anything — the retry looks like success
to the caller (same visit, same `completedAt`, same inspection data) with
no side effects. Covered by a new regression test in
`apps/server/tests/visits.test.ts` ("completing an already-completed visit
twice is a safe no-op...") that asserts `completedAt` and the inspection
observations from the *first* call survive a second call, and that the
timeline has exactly one `VISIT_COMPLETED` entry, not two.

**20.3 Everything else audited and found already correct** — no change
needed, listed here so the next session doesn't re-audit it from scratch:

- **Auth**: access/refresh JWT split, refresh rotation-on-use with
  reuse-detection (a replayed, already-rotated token revokes every
  session for that user, not just itself), password change also revokes
  every other session, same generic error for "no such user" and "wrong
  password" (no user enumeration), rate-limited login/refresh. Both
  clients de-dupe concurrent 401-triggered refreshes (one in-flight
  `/auth/refresh` call, not N), and distinguish a dead session
  (`SessionExpiredError` → route guard sends the user back to login) from
  a dropped connection (`NetworkError` — mobile only; desktop doesn't
  need it, it isn't used on a flaky network the way a phone is) so a
  worker who loses signal mid-visit never gets logged out over it.
- **Authorization**: `assertCaseAccess`/`assertVisitAccess`
  (`apps/server/src/lib/authz.ts`) correctly scope a worker to cases/
  visits they're assigned to (403, not a leaked 404, confirmed by
  `apps/server/tests/visits.test.ts`'s "case/visit access scoping"
  block) — including on the treatment-execution route, which is worker-
  reachable but must still be scoped to their own case. Admin-only
  routes (`requireAdmin`) return 403 before validation ever runs for a
  worker, verified by `authorization.test.ts`.
- **Validation**: every mutating route has a Zod schema; `cuidSchema` is
  deliberately permissive (any non-empty, non-absurd-length string, not a
  strict CUID regex) so a malformed-but-non-empty id reaches Prisma and
  404s like any other unknown id, rather than a validation 400 — a
  documented, deliberate choice (see the schema's own doc comment), not a
  gap. An empty/whitespace id still 400s. Confirmed with new tests.
- **DB integrity**: every multi-step write is a `prisma.$transaction`;
  FKs have sensible `onDelete` (cascade for a case's own children, `SetNull`
  for a photo losing its visit reference); indexes cover every filtered/
  joined column actually queried (`status`, `assignedWorkerId`,
  `scheduledAt`, `caseId`, ...).
- **Photo upload reliability**: the real upload endpoint
  (`POST /visits/:id/photos/upload`) checks `assertVisitAccess` and 15MB/
  image-only limits *before* writing anything, writes the file to
  `StorageDriver` *before* opening the DB transaction (a failed disk write
  never leaves an orphaned `Photo` row pointing at nothing), and
  multer/upload errors map to 400 (`UPLOAD_ERROR`), never a 500. Mobile's
  `uploadVisitPhoto` retries once through a 401 with a freshly refreshed
  token (native `UploadTask` bypasses the API client's own fetch-based
  401-retry, so this is handled separately, deliberately, in
  `lib/photoUpload.ts`). A failed/pending photo is never silently
  dropped — it's kept in the local draft (`lib/draftStore.ts`) with
  status `failed`/`pending`, shown to the worker, and completing the
  visit with pending photos requires an explicit "Terminer quand même"
  confirmation rather than either blocking completion or discarding them.
- **Realtime**: every mutation emits the correct specific event (verified
  by the committed `realtime.test.ts`, unchanged this session); both
  clients treat every event as "refetch", never as data — a payload can't
  desync the UI even though Socket.IO itself is still unauthenticated
  (see 4.7/20.4 below, an accepted, documented gap, not new this
  session).
- **UX**: both clients disable every submit button while its mutation is
  pending (checked all 12 desktop `type="submit"` buttons and mobile's
  shared `BigButton`) — double-tap/double-submit was already guarded
  everywhere it mattered. Desktop's `CaseDetailPage` and mobile's visit/
  case detail screens both have explicit loading, error (with retry), and
  empty states; a 403 renders as a normal error banner, not a crash.
- **Security**: `helmet()` defaults, CORS locked to `CLIENT_ORIGIN`, no
  secret ever appears in a log line (checked every `logger.*` call site
  touching auth code), refresh tokens stored hashed
  (`RefreshToken.tokenHash`, never the raw token).
- **Logging / env config**: structured JSON logger; server refuses to
  boot on invalid/missing env (Zod-validated in `config/env.ts`), so a
  misconfigured deployment fails loudly at startup, not with a confusing
  runtime error later.
- **TypeScript**: `strict` + `noUncheckedIndexedAccess` +
  `noImplicitOverride` repo-wide; `pnpm typecheck` clean (see 20.5).

**20.4 Known gaps, reconfirmed, not closed this session** (same
reasoning as when previous sessions noted them — re-litigated here, not
newly discovered): Socket.IO connections are still unauthenticated
(§4.7/§21 item 2 below — payloads stay id-only and every client's actual
data access is separately authorized via REST, so this is low severity,
but it should close before this goes beyond internal use); desktop's
"Ajouter une photo" form still uses the metadata-only endpoint instead of
a real file picker against the upload endpoint (§21 item 3); no ESLint/
Prettier anywhere in the repo; no real device has ever run the mobile app
(web-platform-only verification, §21 item 1). None of these are new —
carried forward unchanged into the renumbered "Next steps" below.

**20.5 Verification.** Backend test suite: 45/45 passing (39 pre-existing
+ 6 new: the idempotent-re-completion regression, resolved-case
scheduling rejection, and well-formed-vs-malformed case id handling).
Full monorepo `pnpm typecheck` clean. No UI changes were made — the audit
found the existing loading/empty/error-state coverage already adequate,
so there was nothing to change without adding decorative complexity the
brief explicitly ruled out.

## 21. Production deployment readiness (session 7)

Scope: the brief was explicit — the mobile app said "Server unreachable",
fix the root cause (not hide it), and get the whole system (backend,
desktop, mobile) architecturally ready for a real deployment behind a
real HTTPS domain, never depending on `localhost`/a hardcoded developer
IP in production. This section is the full investigation + build log;
§23 "Next steps" carries forward only what's still open.

### 21.1 Root cause of "Server unreachable" (diagnosed with evidence, not guessed)

Inspected the actual running code, not assumptions:

- `apps/mobile/lib/apiClient.ts` (before this session):
  `process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4000/api"`
  — read **unconditionally**, identically in dev and in a production
  build. Same pattern in `lib/socket.ts` (deriving `SOCKET_URL` from
  that same value) and `lib/photoUpload.ts`.
- `find apps/mobile -iname ".env*"` → **no `.env` file existed at all**
  in `apps/mobile/`. So in every normal dev run (`pnpm dev:mobile`,
  `expo start`), `EXPO_PUBLIC_API_BASE_URL` was simply never set, and
  the code silently fell back to `http://localhost:4000/api` — on a
  physical phone or an Android emulator, `localhost` resolves to *that
  device itself*, which has never run this project's server. That's the
  literal mechanism behind "Server unreachable"/"Cannot reach the API
  server": there was never a server at `localhost:4000` from the phone's
  point of view.
- The backend itself was **not** the problem — verified live:
  `httpServer.listen(env.PORT, ...)` (no explicit host argument) binds
  Node's default of all interfaces (`::`/`0.0.0.0`), confirmed already
  correct; `GET /api/health` responded correctly over the network in
  every test this session ran. CORS was also not the mobile app's
  problem (native `fetch` — a real device/emulator, not `expo start
  --web` — sends no `Origin` header at all, so `cors()` was never in the
  request path for a native client; the CORS work this session did (see
  21.3) is a real, separate desktop/production fix, not what caused this
  symptom).
- Socket.IO used the exact same broken derivation (`SOCKET_URL` from
  `API_BASE_URL`), so a fix that touched only `apiClient.ts` would have
  left the realtime connection silently pointed at localhost too.
- **The deeper issue, beyond "someone forgot to set an env var"**: even
  with the bug understood, the *old* code had no way to tell "a
  developer's env var is genuinely unset in dev, fine" apart from "this
  is a shipped production build with no URL baked in, which will look
  exactly like this same 'Server unreachable' symptom on every single
  user's phone, indistinguishable from a dev misconfiguration until
  someone reads the source". That's the actual production risk this
  session had to close — not just "add a LAN IP to my local `.env`".

### 21.2 The fix: one shared config module, `isDev`-gated, fails loudly in production

`packages/shared/src/config/index.ts` (new) — `resolveApiConfig(input,
envVarName)`, the single policy both clients now delegate to (this is
literally the brief's own suggested shape: "packages/shared/config or an
equivalent architecture"):

- An explicit, non-empty URL env var always wins (`VITE_API_BASE_URL` /
  `EXPO_PUBLIC_API_BASE_URL`).
- No env var set **and** `isDev: true` → the one place `localhost:4000`
  is still allowed to appear, clearly commented as dev-only.
- No env var set **and** `isDev: false` (a production build) → throws
  `MissingApiUrlError`, a descriptive message naming the exact variable
  to set. **Never** falls back to localhost in this case — this is the
  actual fix, not the LAN-IP-for-dev part (that part already sort of
  worked if a developer remembered to set it by hand).
- `looksInsecureForProduction()` — a separate, non-throwing pure check
  (kept out of `resolveApiConfig` itself so the shared module has zero
  runtime-specific globals like `console`, since the Node server also
  imports this package) — each client's own `config.ts` uses it to log a
  loud warning if a configured production URL isn't `https://`.

Each app has its own tiny `config.ts`/`config.ts` that reads its own
bundler's env vars (`import.meta.env.VITE_*` for Vite, `process.env
.EXPO_PUBLIC_*` for Expo — genuinely different mechanisms, can't be
unified further than "same policy, different env source") and calls
`resolveApiConfig`:

- `apps/desktop/src/config.ts` — `getApiBaseUrl()`/`getSocketUrl()`/
  `getConfigError()`/`isUsingDevDefaultApi()`. `import.meta.env.DEV` (a
  Vite-provided boolean baked in at build time — `vite dev` vs `vite
  build`, not spoofable by a runtime env var) is the `isDev` input.
- `apps/mobile/lib/config.ts` — same shape, `__DEV__` (React Native's
  build-time global) as `isDev`.
- **Every** call site that used to read `import.meta.env.VITE_API_BASE_URL`/
  `process.env.EXPO_PUBLIC_API_BASE_URL` directly now goes through these
  — `apiClient.ts`, `socket.ts` on both clients, plus mobile's
  `photoUpload.ts` (native `UploadTask` + the web `XMLHttpRequest`
  fallback, 3.14). Grepped for stragglers after the change — none left.
- **Startup guard, both clients**: `apps/desktop/src/main.tsx` and
  `apps/mobile/app/_layout.tsx` call `getConfigError()` *before*
  mounting the real app tree. A production build with no URL configured
  now shows a plain "Erreur de configuration" screen naming exactly
  what's missing, instead of rendering the login screen and then failing
  every request with a confusing generic error. **Verified live, not
  just by reading the code**: built the mobile app in production mode
  (`expo export --platform web`, no `EXPO_PUBLIC_API_BASE_URL` set),
  served the static output, and confirmed the exact string "Erreur de
  configuration" appears in the rendered page (Expo Router's web static
  rendering pre-renders the initial screen, so it shows up even in the
  raw HTML, not just after JS hydration).
- **"Make it obvious this is dev config"**: both clients show a small
  on-screen indicator whenever `source === "dev-default"` (i.e. nobody
  configured anything and the localhost fallback is active) —
  desktop's `AppShell` topbar gets an "API dev locale" badge (title
  attribute shows the actual URL); mobile's new
  `components/DevApiBanner.tsx` renders a "MODE DÉV — API locale
  (...)" banner at the top of every screen. Neither renders anything in
  a real production build (verified: the `looksInsecureForProduction`
  warning *did* fire in the production-mode export above, confirming
  `isDev` really is `false` in that build — but `isUsingDevDefaultApi()`
  correctly stayed false too once a URL was provided, so the banner
  doesn't show for a real configured build).
- Deleted `apps/desktop/src/lib/api.ts` — dead code (confirmed zero
  imports anywhere) left over from the session-1 scaffold, duplicating
  the same broken unconditional-localhost pattern this session fixed
  everywhere else. Mobile's equivalent was already deleted in session 4.

### 21.3 Backend production hardening

- **`trust proxy`** (`apps/server/src/app.ts`, new): `app.set("trust
  proxy", isProduction ? 1 : false)`. Every deployment target this
  project targets (Railway/Render/Fly.io/a single Nginx in front of a
  VPS) terminates TLS one hop in front of the Node process — without
  this, `req.ip` (what `authRateLimiter` keys its per-IP login
  rate-limit on) is the *proxy's* IP for every request, collapsing every
  real client onto one shared rate-limit bucket. A real bug this session
  found by reading the reverse-proxy deployment requirement carefully,
  not something previously reported broken (this project has never been
  deployed behind a real proxy yet).
- **CORS: packaged Electron's `null` origin, allowed explicitly**
  (`app.ts`): a `BrowserWindow` loaded via `win.loadFile()` (i.e. every
  *packaged* production build — see `electron/main.cts`'s `isDev`
  branch) sends the literal string `"null"` as its `Origin` header per
  the Fetch spec's handling of opaque origins. The old CORS check
  (`!origin || clientOrigins.includes(origin)`) would have rejected
  every request from a real installed desktop app — never caught before
  because dev/E2E testing only ever exercised the Vite dev server's real
  `http://localhost:5173` origin, never a truly packaged build. Fixed by
  allowing `origin === "null"` explicitly (not via `CLIENT_ORIGIN` — a
  real browser origin should never be able to claim the literal string
  `"null"`, so this isn't a `*`-equivalent hole). **Verified live**: a
  real curl with `-H "Origin: null"` against a running server returns
  200; `-H "Origin: http://evil.example"` is still rejected.
- **CORS rejections now a clean 403, not a 500**: found while doing the
  live CORS check above — a rejected origin's `Error` fell through to
  the generic `errorHandler` catch-all, logging a full stack trace at
  `error` level for what is an everyday, expected occurrence (a stray
  scanner, a misconfigured client). New `CorsOriginError` class
  (`middleware/errorHandler.ts`), mapped to a clean `403 CORS_REJECTED`
  JSON body and a `warn`-level log line instead. Verified live
  before/after: 500-with-stack-trace → 403-with-one-line-warn.
- **Graceful shutdown actually waits, and actually closes Socket.IO**
  (`apps/server/src/index.ts`, rewritten): the old handler called
  `httpServer.close()` (doesn't wait for its callback) then immediately
  `await prisma.$disconnect()` and `process.exit(0)` — an in-flight
  request's Prisma connection could be torn out from under it, or the
  process could exit before a response was even sent. Also, `server
  .close()` only stops accepting *new* connections; an open Socket.IO
  (WebSocket) connection keeps the underlying HTTP server "open"
  indefinitely, so even a correctly-`await`-ed `close()` would hang
  forever with any client still connected. Fixed: `io.close()` first
  (actively disconnects every socket), *then* `await` a promisified
  `httpServer.close()`, *then* `prisma.$disconnect()`, all guarded by a
  10s force-exit timer (`.unref()`d — never keeps the process alive on
  its own) in case something still hangs, plus a re-entrancy guard for a
  second SIGTERM. **Verified live**: booted the server, sent SIGTERM,
  confirmed the exact log sequence (`Received SIGTERM, shutting down
  gracefully` → `Shutdown complete`) and a clean exit code.
- **`apps/server/Dockerfile`** (new, multi-stage): `deps` (full
  workspace install) → `build` (compile `packages/shared` then
  `apps/server`, generate the Prisma client) → `prod-deps` (a second,
  production-only install + its own Prisma client generation) →
  `runtime` (non-root user, only compiled `dist/` + production
  `node_modules` + `prisma/` copied in, nothing else). Every directory
  stays at the same relative path (`/repo/...`) through every stage
  deliberately — pnpm's `node_modules` is a tree of symlinks into a
  shared `.pnpm` store, and remapping paths between `COPY --from=`
  stages breaks those symlinks; this is *the* most common way a
  hand-written pnpm-monorepo Dockerfile silently produces a broken
  image, avoided here by never remapping. `CMD` runs `prisma migrate
  deploy` (idempotent, safe to run on every container start — see
  Dockerfile's own comment for the multi-replica caveat) then `node
  dist/index.js`. `prisma` (the CLI, not just `@prisma/client`) moved
  from `devDependencies` to `dependencies` in `apps/server/package.json`
  specifically so it's present in the production `node_modules` for this
  to work.
  **Honesty about verification**: this sandbox has no working Docker
  daemon (`dial unix /var/run/docker.sock: ... no such file`, and
  starting one fails with `ulimit: Operation not permitted` — a sandbox
  restriction, not a project bug). **Could not run an actual `docker
  build`.** What *was* verified: every individual command the Dockerfile
  runs (`pnpm install --frozen-lockfile`, `pnpm --filter @msph/shared
  build`, `pnpm --filter @msph/server prisma:generate`, `pnpm --filter
  @msph/server build`, `pnpm install --frozen-lockfile --prod`) was run
  directly on this machine and succeeds. The Dockerfile itself is
  unexecuted — **verify with a real `docker build -f
  apps/server/Dockerfile -t msph-server .` before trusting it in
  production**, ideally via the (also unexecuted) CI... no, there's no
  backend Docker-build CI job by design (the `backend.yml` workflow
  builds via `tsc`, matching how the app is actually likely to be
  deployed on the listed platforms without a container registry step) —
  a manual `docker build` is the next session's first job if Docker
  deployment is the chosen path.
- `.dockerignore` (new, at the repo root — Docker's standard convention:
  it applies to the whole build context, and the build context here is
  the repo root, not `apps/server/`, because of the workspace
  dependency on `packages/shared`).
- `.env.example` (root) rewritten with explicit "PRODUCTION:" callouts
  on every variable that must change from its dev default, plus the new
  `STORAGE_*` S3 variables (21.4) and a note on `trust proxy`.

### 21.4 Object storage: S3-compatible driver added alongside local

`apps/server/src/storage/s3StorageDriver.ts` (new) implements the
existing `StorageDriver` interface (the seam sessions 4-6 already
documented as "add an S3/R2 driver here later") using
`@aws-sdk/client-s3`'s `PutObjectCommand` — works against real AWS S3,
Cloudflare R2, Backblaze B2, Supabase Storage's S3-compatible endpoint,
or a self-hosted MinIO, since they all speak the same API. Same
random-UUID-key + safe-extension-derivation behavior as
`localStorageDriver.ts` (never trusts the client-supplied filename as
anything but an extension hint) — swapping drivers changes nothing about
`Photo.storageKey`'s shape, only where the bytes live.

`config/env.ts` gained `STORAGE_BUCKET`/`STORAGE_REGION`/
`STORAGE_ENDPOINT`/`STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY`/
`STORAGE_FORCE_PATH_STYLE`/`STORAGE_PUBLIC_URL_BASE`, and
`STORAGE_DRIVER`'s enum grew from `["local"]` to `["local", "s3"]`.
`storage/index.ts`'s `createStorageDriver()` validates the three
required S3 vars are present *before* constructing the driver, throwing
one clear error naming every missing variable — same fail-fast
philosophy as `config/env.ts` itself.

**Verified live** (real commands, real process, not just reading the
code): booted the server with `STORAGE_DRIVER=s3` and no credentials →
immediate, clear startup error naming exactly `STORAGE_BUCKET,
STORAGE_ACCESS_KEY, STORAGE_SECRET_KEY`. Booted again with
`STORAGE_DRIVER=s3` and fake-but-present credentials → boots cleanly,
`/api/health` responds normally (constructing an `S3Client` doesn't
itself make a network call — only `.send()` on an actual upload would,
and no upload was attempted). **Not verified**: an actual upload against
a real S3/R2 bucket — no real bucket/credentials available in this
session. Next session (or whoever provisions real storage) should
upload one real photo through the full mobile → API → S3 → desktop-
photo-view path before trusting this beyond "it boots".

### 21.5 Desktop: electron-builder Windows packaging

`apps/desktop/electron-builder.yml` (new) + `package.json` scripts
(`dist`/`dist:win`/`dist:mac`/`dist:linux`, each running `build` first)
+ root-level `pnpm desktop:dev`/`desktop:build`/`desktop:dist`/
`desktop:dist:win`. `appId: com.msph.desktop`, NSIS target for Windows
(`allowToChangeInstallationDirectory`, desktop+start-menu shortcuts),
`asar: true`, `publish: null` (no auto-update/GitHub-Releases publishing
configured — would need a real release pipeline first).

**A real packaging bug found and fixed via an actual build, not
inspection**: desktop's renderer npm dependencies (`react`,
`@tanstack/react-query`, `date-fns`, `socket.io-client`, `zod`,
`@msph/shared`, ...) were listed in `package.json`'s `dependencies`.
electron-builder auto-includes every `dependencies` entry's
`node_modules` content in the packaged app *regardless* of the `files`
allowlist (to make sure `require()` calls at runtime resolve) — but
none of these are actually `require()`'d by the Electron **main**
process at runtime; they're all bundled into `dist/assets/*.js` by Vite
for the **renderer**, which loads that already-bundled file, not raw
node_modules. Building with these still in `dependencies` produced a
460× larger package than necessary: a 23MB `app.asar` containing the
*entire* `@msph/shared` workspace package (including its TypeScript
`src/`, not just `dist/`) and nothing-useful. Fixed by moving all of
these to `devDependencies` (correct for an Electron+Vite app with zero
main-process npm dependencies — confirmed `electron/main.cts`/
`preload.cts` only import `electron` + Node builtins + local files).
Re-packaged after the fix: **460KB** `app.asar`, containing exactly
`dist/`, `dist-electron/`, and `package.json` — nothing else.

**Executable-name bug, also found via a real build**: electron-builder
derives the packaged binary's filename from `package.json`'s `name`
field by default, which is the scoped `"@msph/desktop"` — producing a
mangled `@msphdesktop` binary. Fixed with an explicit `executableName:
msph-desktop` in `electron-builder.yml`.

**Verified live, further than "it builds"**: ran a real `electron-
builder --dir --linux` (a full package, skipping only the Windows-
specific NSIS installer step, which needs a real Windows machine or Wine
— neither available here) → launched the resulting `msph-desktop`
binary under `xvfb-run`/a real `Xvfb` display → the process ran for
several seconds with no JS-level crash and no uncaught
`MissingApiUrlError` (only the same container-only dbus/GPU noise
session 1 already documented as harmless). Attempted a literal
screenshot to visually confirm the config-error screen rendered but no
ImageMagick/Playwright was available in this sandbox for that specific
check — the process-level evidence (ran continuously, no crash, no
uncaught error in the log) is real but is not the same as a visual
confirmation; a future session with a windowed display or a screenshot
tool available should close that last gap.
**Not verified**: the actual Windows NSIS `.exe` output — needs a real
Windows/Wine build, wired into `.github/workflows/desktop.yml` on a
`windows-latest` runner but not yet executed against real GitHub Actions
infrastructure.

Windows code signing is deliberately **not** configured — see
`electron-builder.yml`'s own comment and README.md "Windows code
signing" for exactly what an unsigned build means for end users
(SmartScreen "Unknown publisher" warning — expected, not a bug, fine for
internal distribution) and what buying a real certificate would involve.
No custom app icon exists yet either (`apps/desktop/build/README.md`
explains what to add and where) — electron-builder's own default icon is
used until then.

### 21.6 Mobile: EAS build configuration

`apps/mobile/eas.json` (new) — `development`/`preview`/`production`
profiles, each with its own `EXPO_PUBLIC_API_BASE_URL` (`preview`/
`production` default to a placeholder production-domain string that
must be edited to the real deployed API before a real build — documented
in README.md, deliberately not a fake example domain baked in silently).
`apps/mobile/app.json` gained real `android.package`/`android.versionCode`
and `ios.bundleIdentifier`/`ios.buildNumber` (`com.msph.mobile`, version
1) — previously absent entirely, which would have blocked any real EAS
build outright.

**Verified as far as this sandbox allows**: `expo config --type public`
resolves the edited `app.json` correctly (bundle id/package name appear
in the resolved config, no schema errors). `pnpm dlx eas-cli@latest
config --profile production --platform android --non-interactive`
successfully *parsed* `eas.json` and got as far as requiring a real
login (`An Expo user account is required to proceed`) — i.e. eas-cli
itself accepts the file's shape, not just "it's valid JSON". **A real
`eas build` was not run** — needs a real Expo account (`eas login`) this
session has no credentials for. That login, plus `eas build:configure`
(which writes a real `extra.eas.projectId` into `app.json`), is the
literal next step before any real Android/iOS binary exists.

### 21.7 CI/CD — three GitHub Actions workflows, kept simple

`.github/workflows/`:

- **`backend.yml`** — push/PR (paths: `apps/server/**`,
  `packages/shared/**`): typecheck, `pnpm --filter @msph/server test`
  against a real `postgres:16` service container (credentials
  deliberately matched to `vitest.config.ts`'s own hardcoded
  `DATABASE_URL` — see the workflow's own comment for why: vitest
  overrides `process.env` with its own fixed test config regardless of
  the job's exported env, so the two must agree), production build. No
  deploy step by design (platform auto-deploy-on-push is a dashboard
  setting on Railway/Render/Fly.io's side, not a CI job's).
- **`desktop.yml`** — manual (`workflow_dispatch`) or a `desktop-v*` tag:
  builds the real Windows NSIS installer on a `windows-latest` runner
  (native, no Wine needed), optionally writing `VITE_API_BASE_URL` from
  a repo variable if `.env.production` wasn't already committed;
  uploads the `.exe` as a build artifact.
- **`mobile.yml`** — manual only (`workflow_dispatch`, deliberately not
  automatic — an EAS build spends real build-minutes on the project's
  Expo account): triggers `eas build --profile <chosen> --platform
  <chosen> --non-interactive --no-wait` via `expo/expo-github-action`,
  needs an `EXPO_TOKEN` repository secret.

Verified: all three parse as valid YAML (`python3 -c "import yaml;
yaml.safe_load(...)"` on each). **Not verified**: none has actually run
on real GitHub Actions infrastructure (this sandbox has no GitHub
Actions runner) — the backend workflow's exact command sequence *was*
run manually on this machine and works (typecheck, migrate deploy
against a fresh DB, test, build all succeeded — see 21.1-21.4's
verification notes); the desktop/mobile workflows' unique steps
(windows-latest NSIS build, a real `eas build` trigger) could not be.

### 21.8 Security/hardcoded-value scan (repo-wide)

Grepped for `localhost`, `127.0.0.1`, `0.0.0.0`, hardcoded LAN-style IPs,
and hardcoded secrets/API keys across every `.ts`/`.tsx`/`.json`/`.md`
file (excluding `node_modules`/`dist`). Findings, each categorized:

- `localhost:4000/api` fallbacks in both clients' API layers — **the
  bug**, fixed (21.1-21.2).
- `apps/desktop/src/lib/api.ts`'s own `localhost` fallback — **dead
  code**, deleted (unused, zero imports; duplicated the same broken
  pattern).
- `apps/server/electron/main.cts`'s `win.loadURL("http://localhost:5173")`
  — legitimate, already correctly guarded by `isDev` (only reached in a
  dev run, never a packaged build) — no change.
- `apps/server/src/config/env.ts`'s `CLIENT_ORIGIN`/`STORAGE_PUBLIC_URL`
  defaults — legitimate dev fallbacks, only used when the env var isn't
  set; a real deployment must set both for real (already documented,
  strengthened this session with explicit "PRODUCTION:" callouts in
  `.env.example`) — no change to the code, docs improved.
- `apps/server/vitest.config.ts` / `tests/realtime.test.ts` — test
  fixtures, correctly using `localhost` for an in-process test server —
  legitimate, no change.
- README.md/CONTEXT.md's own `localhost` mentions — documentation
  describing dev defaults — legitimate, no change beyond the doc updates
  this session made anyway.
- **No hardcoded LAN IP, no hardcoded secret/API key/database password**
  found anywhere outside documented dev placeholders (`dev-access-
  secret-change-me` etc., already clearly named as such) and test
  fixtures.
- `.gitignore` audited and tightened: `.env.production`/
  `.env.development`/`.env.staging` are now explicitly ignored (only
  `.env` and `.env.*.local` were before) — every real env file variant
  is now covered, only the committed `.env*.example` templates survive.

### 21.9 Production deployment architecture (current state)

```
DESKTOP (Electron + React)                MOBILE (Expo + React Native)
  reads VITE_API_BASE_URL                   reads EXPO_PUBLIC_API_BASE_URL
  baked in at `vite build` time             baked in at `eas build` time
  (.env.production, committed —             (eas.json per-profile `env`,
  it's a public URL, not a secret)          committed — same reasoning)
        |  HTTPS + WSS                              |  HTTPS + WSS
        └───────────────────┬────────────────────────┘
                             v
                  PRODUCTION API (Express)
                  behind a reverse proxy that
                  terminates TLS (Railway/Render/
                  Fly.io's built-in proxy, or your
                  own Nginx) — `trust proxy` set,
                  CORS locked to real origins,
                  Socket.IO on the same origin/port
                  as the REST API (no separate
                  realtime host)
                             |
                  ┌──────────┴──────────┐
                  v                     v
            PostgreSQL          Object storage (S3-
        (managed, e.g.         compatible: S3/R2/B2/
         Railway/Render/       Supabase/MinIO) — photo
         RDS/Supabase)         binaries; DB stores only
                                metadata (storageKey/url)
```

Both clients' realtime connection derives from the *same* config value
as their REST API base URL (`getSocketUrl()`, stripping `/api`) — there
is no separate "realtime server" to configure or point anywhere
different; Socket.IO is mounted on the same Express `http.Server`
(unchanged design, sessions 1-5). A production deployment therefore
needs exactly one public HTTPS hostname for the whole backend (e.g.
`api.your-domain.com`), never a second one for realtime.

### 21.10 What still blocks a real public deployment (honest, in order)

1. **A real server/hosting account** — none provisioned. Pick one of
   Railway/Render/Fly.io/a VPS (see README.md "Backend"); none is
   hard-coded into the app, all read `DATABASE_URL`/`CLIENT_ORIGIN`/etc.
   from the environment.
2. **A real domain + HTTPS certificate** for the API (e.g.
   `api.your-company.com`) — `CLIENT_ORIGIN`, `VITE_API_BASE_URL`,
   `EXPO_PUBLIC_API_BASE_URL` (in `eas.json`) all need this real value
   substituted for their current placeholders once it exists.
3. **A real Docker build**, verified end-to-end (`docker build` +
   `docker run` + a real HTTP request) — the Dockerfile is written and
   every command it runs was individually verified, but the multi-stage
   image itself has never actually been built (no Docker daemon in this
   sandbox — see 21.3).
4. **A real S3-compatible bucket** (Cloudflare R2 is the cheapest sane
   default — no egress fees) with real credentials, and one real photo
   uploaded through the full mobile → API → bucket → desktop-view path.
5. **A real Expo account** (`eas login`) + `eas build:configure` (writes
   a real `extra.eas.projectId`) before any Android/iOS binary can be
   produced.
6. **A paid Apple Developer Program account** ($99/yr) before any real
   iOS device build or App Store/TestFlight submission — not needed for
   Android.
7. **A Windows/Wine build environment** (or just push a `desktop-v*` tag
   and let `.github/workflows/desktop.yml`'s `windows-latest` runner do
   it) to produce the actual `.exe` installer — packaging itself is
   proven (21.5), only the Windows-specific NSIS step is unexecuted.
8. **Code signing** (Windows: a real certificate from a CA; Apple:
   comes bundled with the Developer Program account in #6) — not set up,
   documented as deliberately deferred (README.md "Windows code
   signing").
9. Optional but recommended before going live: Socket.IO auth (still an
   open item from session 3, unrelated to this session's work — see
   §4.7), a real app icon for desktop (currently electron-builder's
   default) and a real logo/adaptive-icon refresh for mobile (currently
   session-1 placeholder assets).

### 21.11 Bugs found and fixed this session (consolidated)

1. **The root cause**: both clients' unconditional `localhost` API-URL
   fallback, used in dev and production alike — see 21.1-21.2.
2. **Backend rate-limiter bypass behind a reverse proxy**: no `trust
   proxy` set, so every request's `req.ip` would be the proxy's IP in
   any real deployment — see 21.3.
3. **CORS would reject every packaged-Electron production request**:
   the `"null"` origin case — see 21.3.
4. **CORS rejections logged as 500s with full stack traces** instead of
   clean 403s — see 21.3.
5. **Graceful shutdown didn't actually wait** for in-flight
   requests/open Socket.IO connections before disconnecting Prisma and
   exiting — see 21.3.
6. **Desktop packaging bloat**: renderer npm dependencies wrongly listed
   as Electron `dependencies`, pulling a full unused `node_modules` tree
   (including source, not just built output) into every package — 50×
   size reduction after the fix — see 21.5.
7. **Desktop packaged executable name mangled** (`@msphdesktop`) — see
   21.5.

### 21.12 Verification summary

Everything re-run clean at the end of this session: `pnpm typecheck`
(all 4 packages), `pnpm --filter @msph/server test` (45/45, unchanged
from session 6 — no test logic touched this session, only
infrastructure), `pnpm --filter @msph/desktop build`, a real
`electron-builder --dir --linux` package + launch, `pnpm --filter
@msph/mobile exec expo export --platform web` (twice — with and without
an API URL configured, both producing correct behavior), and a live
`prisma migrate deploy` against a brand-new, genuinely empty database
(created and dropped specifically for this check, not reusing
`msph_dev`/`msph_test`). See each subsection above for exactly what was
and wasn't verified by execution versus by reading the code — this
session tried hard not to claim "done" for anything it couldn't actually
run.

## 22. Real-world deployment debugging (session 8)

The user actually deployed this session — Railway for the backend,
electron-builder for the Windows desktop installer — and reported real
errors as they hit them. Four real bugs were found and fixed; two more
"bugs" turned out to be configuration/environment issues, not code. In
rough chronological order:

### 22.1 Prisma engine crash on Alpine

Railway deploy log showed the Prisma schema engine crashing on startup
with a non-JSON error the CLI couldn't parse, preceded by libssl
warnings. Root cause: `apps/server/Dockerfile` used `node:20-alpine`.
Prisma's engine binaries are unreliable on Alpine (musl libc + its
OpenSSL packaging) — not a version-pinning problem, Prisma's own docs
recommend a glibc-based image instead. Fixed by switching both the
`base` and `runtime` stages to `node:20-bookworm-slim`, and updating the
Alpine-specific `addgroup`/`adduser` syntax to Debian's
`groupadd`/`useradd`. Verified: local typecheck + 45/45 tests (this
doesn't exercise Docker directly — no Docker daemon in this sandbox —
but confirmed via the user's next Railway deploy). Commit `cb5caad`.

### 22.2 Prisma OpenSSL version mismatch (debian-openssl-1.1.x vs 3.0.x)

Next Railway deploy got past the Alpine crash but failed with "engine
generated for debian-openssl-1.1.x, but deployment required 3.0.x".
Root cause: `prisma generate` auto-detects which OpenSSL version to
target by checking what's installed in the stage that runs it — the
Dockerfile's `runtime` stage installed `openssl`, but `deps`/`build` and
`prod-deps` (the stages that actually run `prisma generate`) didn't, so
detection silently guessed wrong. Fixed two ways, deliberately
redundant: (1) moved `apt-get install openssl` into the shared `base`
stage, inherited by every stage that generates a client; (2) added
explicit `binaryTargets = ["native", "debian-openssl-3.0.x"]` to
`schema.prisma`'s generator block, so the right engine ships regardless
of what auto-detection guesses. Verified locally: confirmed
`libquery_engine-debian-openssl-3.0.x.so.node` actually present on disk
after `prisma generate`, 45/45 tests. Commit `188e81b`.

### 22.3 Electron `fetch()` + `file://` incompatibility (electron/electron#3922)

Packaged Windows installer showed "Impossible de contacter le serveur"
on every login attempt. DevTools console (screenshot from the user)
showed `net::ERR_FILE_NOT_FOUND` on the login request — not a network
error, a resource-loading error, despite the request being a `fetch()`
POST to a real HTTPS URL. Researched via WebSearch: this is a long-
documented Electron bug — a renderer loaded via `win.loadFile()` (a
`file://` origin) breaks `fetch()` for cross-origin requests, which is
exactly what every API call in this app's `apiClient.ts` is. Fixed by
rewriting `apps/desktop/electron/main.cts` to serve the renderer over
plain loopback HTTP instead of `file://`: a tiny `node:http` static file
server bound to `127.0.0.1:47829` (fixed port, not ephemeral — see its
own doc comment for why), serving `dist/` transparently through the
asar archive, with SPA-style fallback to `index.html` for extensionless
paths. Production `BrowserWindow` now does
`win.loadURL("http://127.0.0.1:47829/index.html")` instead of
`win.loadFile()`. Backend CORS (`apps/server/src/app.ts`) updated to
allow this exact origin unconditionally — safe because it's
loopback-only, never reachable from outside the user's own machine, and
no real web page can make a browser claim to *be* that origin.
Verified: a real `electron-builder` package, launched headless under
Xvfb with `--remote-debugging-port`, inspected via raw CDP
(`Runtime.evaluate` over the debugger WebSocket) — confirmed the
renderer actually loads from the new origin. Could **not** verify the
live network round-trip end-to-end in this sandbox: even a plain GET
from inside Electron to an external host fails here (confirmed via a
control test), because this sandbox's own outbound proxy is invisible
to Electron's network stack specifically — a sandbox limitation, not a
statement about whether the fix works on a real machine. Commit
`8986fe7`.

### 22.4 Desktop dev mode wouldn't pick up `VITE_API_BASE_URL` from `.env`

After the fixes above, the user tried pointing local dev mode
(`pnpm dev`) at the Railway backend instead of running a local server —
`apps/desktop/.env` with `VITE_API_BASE_URL=https://msph-production.up.railway.app/api`.
The app kept falling back to `http://localhost:4000/api` regardless.
Four rounds of remote diagnosis on the user's Windows machine (full
`pnpm dev` restart, recreating `.env` via Notepad instead of PowerShell
`echo` to rule out UTF-16 encoding, a full fresh `git clone` +
`pnpm install`) all produced the same result. Re-reading
`vite.config.ts`, `src/config.ts`, `src/vite-env.d.ts` and grepping for
stray `localhost`/`4000` references found no bug in the code — the
mechanism is structurally correct. Root cause was never conclusively
identified (most likely something specific to that machine's Vite/Node
setup, never confirmed).

**Fix — a second, independent config path that bypasses Vite's `.env`
loading entirely**: `main.cts` now optionally reads a plain
`msph-config.json` file with a bare `fs.readFileSync` (dev:
`apps/desktop/msph-config.json`, next to `package.json`; packaged:
next to the installed `.exe` — writable without admin rights since NSIS
installs per-user) and, if present, appends `apiBaseUrl`/`socketUrl` as
query-string params on whatever URL it loads
(`withRuntimeConfig()`). `src/config.ts` now reads
`new URLSearchParams(window.location.search)` for those params *before*
falling back to `import.meta.env.VITE_API_BASE_URL` — see
`readRuntimeConfigParam()`. This is deliberately the simplest possible
mechanism (no bundler, no build step, no encoding footguns from a text
editor) specifically so it's trivial to verify by eye and matches
exactly what a real user would want: "open the folder you installed
MSPH into, drop in one small JSON file." `.gitignore` updated so a real
`msph-config.json` (machine-specific, holds a live URL) is never
committed, mirroring the existing `.env`/`.env.example` pattern; a
`msph-config.example.json` documents its shape. The Vite `.env`
mechanism still works exactly as before — this is an additional
fallback, not a replacement, so nothing about session 7's env-config
system changed.

Verified end-to-end in this sandbox (dev-mode code path, the one the
user was actually blocked on): launched Vite + Electron headless under
Xvfb, with a real `msph-config.json` present; confirmed via the main
process's own log line that it read and parsed the file; confirmed via
CDP `Runtime.evaluate` that `window.location.search` carried the
expected query string in the renderer; then actually filled in and
submitted the login form via a synthetic DOM event and watched
`Network.requestWillBeSent` over CDP — the request went to
`https://msph-production.up.railway.app/api/auth/login`, not
`localhost:4000`. Full typecheck (all 4 packages) and
`pnpm --filter @msph/desktop build` also clean; server test suite
re-run 45/45 (local Postgres started in this sandbox specifically to
run it). The packaged-build code path (`app.getPath("exe")`-relative
lookup) was written the same way as the already-verified dev path but
not re-verified by execution this session (no Windows/no real installer
run here).

### 22.5 Two configuration issues that were never code bugs

- **`desktop-v0.1.1` git tag pointed at a commit that predated the real
  fix.** `git fetch origin --tags` + `git merge-base --is-ancestor`
  showed the tag's commit wasn't an ancestor of this fix branch, so the
  CI-built `.exe` from that tag could never have contained the fetch()
  fix. User was told to delete and recreate the tag against the current
  branch head.
- **Markdown link syntax pasted into a config value.** A DevTools
  warning showed `VITE_API_BASE_URL="[https://...](https://...)"` — the
  literal rendered-chat-link brackets, not a real URL — in both the
  local `.env.production` (user fixed it) and, separately, the GitHub
  Actions repository Variable of the same name (which is what a fresh
  CI checkout actually uses, since `.env.production` is gitignored and
  never present in CI). A reminder for future sessions: when telling a
  user to paste a URL into a config file or CI variable, say explicitly
  "paste the plain URL, not a markdown link" — this has now bitten twice
  in different projects.

Not yet confirmed by the user as resolved: whether the GitHub Actions
variable was fixed, whether the tag was recreated, and whether they're
working from a `main` branch that has diverged from this one.

## 23. Next steps (recommended order for the next session)

Reordered this session — deployment execution now leads, since §21.10
lists exactly what's blocking it and everything there just needs real
credentials/infrastructure this sandbox didn't have, not more code:

1. **Provision the real deployment** (§21.10, items 1-2): pick a host
   (Railway/Render/Fly.io/a VPS), attach managed Postgres, get a real
   domain + HTTPS. Then run a real `docker build -f
   apps/server/Dockerfile -t msph-server .` + `docker run` for the first
   time anywhere (§21.3/21.10 item 3) and confirm `GET /api/health`
   responds over the real public URL.
2. **Real S3-compatible bucket** (§21.10 item 4): create one (Cloudflare
   R2 recommended — no egress fees), set the `STORAGE_*` env vars for
   real, upload one real photo through the full mobile → API → bucket →
   desktop-view path — the driver code is written and boots correctly
   with credentials present, but has never touched a real bucket.
3. **`eas login` + `eas build:configure`** (§21.10 item 5) — the literal
   next command before any real Android/iOS binary can exist. Then a
   real `eas build --profile preview` to confirm the whole pipeline
   (app.json config, eas.json profile, the shared config module's
   production behavior) actually produces an installable APK.
4. **Push a `desktop-v*` tag** (or run `.github/workflows/desktop.yml`
   manually) to get the first real Windows NSIS `.exe` out of CI (§21.5/
   21.10 item 7) — packaging itself is proven, only this specific
   platform-native step is unexecuted.
5. **Real device pass** (carried over, unchanged from session 5/6) —
   confirm on a real phone that camera capture, `UploadTask`'s native
   upload transport (3.14), and realtime delivery over a real network
   behave the same as verified on web, now compounded with this
   session's config changes (confirm a real device with
   `EXPO_PUBLIC_API_BASE_URL` unset shows the config-error screen rather
   than something confusing, and that a LAN-IP-configured dev build
   connects correctly).
6. **Socket.IO auth** — connections are still unauthenticated (§4.7).
   Not closed this session either — still low priority while payloads
   stay minimal (ids + one small field, no sensitive data, and every
   client's actual data access is separately authenticated/authorized
   via REST regardless of which events it received) — but worth closing
   before this ships beyond internal use, and directly relevant now that
   "beyond internal use" is an active goal, not a hypothetical.
7. **Windows/Apple code signing** (§21.10 item 8) — buy a certificate/
   enroll in the Apple Developer Program once ready for a real public
   (not internal-only) release; both are explicitly deferred, not
   forgotten.
8. **Storage driver hardening (desktop parity)**: the desktop's "Ajouter
   une photo" form still uses the metadata-only `POST /visits/:id/photos`
   endpoint (a manual storageKey reference) rather than the real upload
   endpoint (section 5) — give it a real file picker against `POST
   /visits/:id/photos/upload` instead, for parity with mobile.
9. **Port the live cross-client verification (19.4) into a committed
   test** now that CI infrastructure exists (`.github/workflows/`) —
   would need a workflow that can run multiple dev servers + a browser,
   which none of this session's three workflows currently do (they're
   deliberately narrow — typecheck/test/build, an installer build, an
   EAS trigger). Today it's still a real but ephemeral manual run.
10. **ESLint/Prettier** — carried over from sessions 1-6, still not done.
11. A real app icon for desktop (`apps/desktop/build/README.md`) and a
    real logo/adaptive-icon refresh for mobile (currently session-1
    placeholder assets) — cosmetic, but needed before a real public
    release either platform's build would otherwise ship with generic
    defaults.
12. Eventually (unchanged from session 6, still true): email ingestion,
    an `OWNER` role tier if the business ever needs one (3.2), a real
    accessibility pass on desktop's `SearchSelect`/`Modal`/`Drawer`
    (currently mouse-driven), hoisting French labels into
    `packages/shared` now that both real clients need them (3.13), a
    background sync queue for mobile if offline usage patterns turn out
    to need more than the current "don't lose the draft, retry visibly"
    approach (18.8), per-event-type client refetch logic (4.6), and the
    desktop cases list's "last activity" column / list pagination
    (17.8) — none of these are deployment blockers, all still valid.

## 24. Commands reference

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

# --- Production (session 7 additions — see §21 for what's actually
#     been verified vs. still needs real credentials/infrastructure) ---

# Backend: build + run the production Docker image (context = repo root)
docker build -f apps/server/Dockerfile -t msph-server .
docker run --rm -p 4000:4000 --env-file apps/server/.env.production msph-server

# Backend: apply migrations directly against a real prod DB (no container)
DATABASE_URL="<real production DATABASE_URL>" \
  pnpm --filter @msph/server exec prisma migrate deploy

# Desktop: build the Windows installer (needs apps/desktop/.env.production
# with a real VITE_API_BASE_URL set first — copy from .env.production.example)
pnpm desktop:build
pnpm desktop:dist:win    # -> apps/desktop/release/MSPH Setup <version>.exe
# NSIS only builds natively on Windows/Wine — on this machine, validate
# packaging itself (no installer) with:
cd apps/desktop && pnpm exec electron-builder --dir --linux

# Mobile: one-time EAS setup, then real builds (needs a real Expo account)
npx eas-cli login
npx eas-cli build:configure
pnpm mobile:build:preview       # apps/mobile/eas.json "preview" profile -> APK
pnpm mobile:build:production    # "production" profile -> AAB (Android) + iOS build

# CI: trigger the desktop/mobile workflows manually instead of via the CLI
# (GitHub CLI/web UI -> Actions -> select workflow -> Run workflow), or
# push a `desktop-v*` tag for the desktop one.
```

## 25. Environment variables

See `.env.example` at repo root for the full documented server list
(session 7: now includes `STORAGE_BUCKET`/`STORAGE_REGION`/
`STORAGE_ENDPOINT`/`STORAGE_ACCESS_KEY`/`STORAGE_SECRET_KEY`/
`STORAGE_FORCE_PATH_STYLE`/`STORAGE_PUBLIC_URL_BASE`, only required when
`STORAGE_DRIVER=s3` — see §21.4) — copy it to `apps/server/.env` and
fill in real values. Never commit `.env`/`.env.production`/
`.env.development`/`.env.staging` files (all gitignored as of this
session — only the `.env*.example` templates are meant to be committed)
or hardcode secrets in code.

**Desktop** (`apps/desktop/src/config.ts` is now the single place these
are read — see §21.2):

- `VITE_API_BASE_URL` — dev: defaults to `http://localhost:4000/api`
  (only in a `vite dev` build, `import.meta.env.DEV`). Production (`vite
  build`): **required** — a build with this unset shows a clear
  "Erreur de configuration" screen at startup instead of trying
  localhost. Set via `apps/desktop/.env` (dev) or `.env.production`
  (production — copy from `.env.production.example`; Vite loads this
  file automatically for any `vite build`).
- `VITE_SOCKET_URL` — defaults to `VITE_API_BASE_URL` with the trailing
  `/api` stripped; same dev/production rule.

**Mobile** (`apps/mobile/lib/config.ts` is now the single place these
are read — see §21.2):

- `EXPO_PUBLIC_API_BASE_URL` — dev: defaults to `http://localhost:4000
  /api` (only in a dev build, RN's `__DEV__`). **Must be a LAN IP, not
  `localhost`, when testing on a physical device or Android emulator** —
  `localhost` there resolves to the device itself, not the dev machine
  (this was last session's actual "Server unreachable" bug — see §21.1).
  Production (`eas build`): **required**, set per-profile in
  `apps/mobile/eas.json`'s `env` block (NOT read from a local `.env` file
  — EAS builds run on Expo's own servers, which never see your shell or
  local files) — a build with this unset shows a clear configuration-
  error screen instead of trying localhost.
- `EXPO_PUBLIC_SOCKET_URL` — defaults to `EXPO_PUBLIC_API_BASE_URL` with
  the trailing `/api` stripped; same dev/production rule.

Set the dev values in the shell before `expo start`, or in an
`apps/mobile/.env` file (Expo reads that automatically — see
`apps/mobile/.env.example`).

Both apps show an on-screen indicator (desktop: an "API dev locale" badge
in the topbar; mobile: a "MODE DÉV" banner) whenever
`source === "dev-default"` — i.e. nobody configured anything and the
hardcoded localhost fallback is active — so a stray dev build is never
mistaken for a working connection to a real environment.

Remember to add whatever origin actually serves a browser-based client
(the desktop's `:5173`, mobile web's `:8081`, your real production
desktop/web origin) to the server's own `CLIENT_ORIGIN` (comma-separated,
see `.env.example`) — native mobile fetch (a real device/emulator, not
web) sends no `Origin` header and is unaffected by this, and a packaged
Electron app's `file://`-loaded renderer sends the literal string
`"null"`, which the server allows explicitly (§21.3) — nothing to add to
`CLIENT_ORIGIN` for that case either.
