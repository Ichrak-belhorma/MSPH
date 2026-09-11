# CONTEXT.md — MSPH Project Memory

**Read this file completely at the start of every session.** It is the
persistent memory of the project. Do not redo completed work — check
"Current status" and "Next steps" first and continue from there.

Last updated: 2026-09-11 (session 2 — backend API: auth, all resource
modules, authorization, case timeline, tests).

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
  hashing), vitest + supertest tests. **The full REST API is implemented
  and tested as of session 2** — see section 8.
- **apps/desktop** — Electron + React + TypeScript + Vite. Manager/admin
  app. Still placeholder screens except Dashboard's health check — does
  not call the case/visit/etc. API yet.
- **apps/mobile** — Expo (SDK 57) + React Native + TypeScript, using
  **Expo Router** (file-based routing). Worker field app. Same status as
  desktop — screens exist, not wired to the real API yet.
- **packages/shared** — domain types, Zod schemas, enums, constants. Both
  apps and the server import from `@msph/shared`; nothing is duplicated.
- **Package manager**: pnpm workspaces (`pnpm-workspace.yaml`). Pinned via
  `packageManager` in root `package.json` — currently `pnpm@10.34.5`. If
  `pnpm install` ever fails with `ERR_PNPM_NO_MATCHING_VERSION`, bump this
  field to whatever `pnpm --version` reports on the machine and re-run.
  `pnpm-workspace.yaml` also carries an `allowBuilds` block (native
  postinstall scripts for `argon2`, `electron`, `@prisma/client`,
  `@prisma/engines`, `esbuild`, `prisma`) written by `pnpm approve-builds
  --all` in session 1 — a fresh `pnpm install` on this machine won't
  re-prompt for those.

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
fine-grained stage lives on the **visit history** instead, and — new in
session 2 — on the **case activity timeline** (section 3.7). `Case.status`
stays a coarse bucket for dashboard columns.

**Session 2 implements this as a real state machine**, not just a
documented intention — see section 9 "Case status state machine" for the
full mechanics (`apps/server/src/modules/cases/case-status.ts`).

### 3.2 User roles: ADMIN + WORKER (session 1, unchanged)

"ADMIN / OWNER" in the brief is read as one admin-tier role written with a
slash, not two roles. If a narrower OWNER tier is ever needed, add it to
the `UserRole` enum then.

### 3.3 Property has no direct `customerId` (session 1, unchanged)

`Property` links to `Landlord` (stable owner); the tenant/customer
relationship is per-`Case`, modeling rental turnover correctly.

### 3.4 Visit/Inspection split, `condition` is free text (session 1, unchanged)

### 3.5 `CaseTreatment.status` (PLANNED/COMPLETED/CANCELLED) (session 1, unchanged)

### 3.6 IDs are `cuid()`, but validated loosely (session 2 change)

Prisma still generates real cuids for every row (`@default(cuid())`,
unchanged). **What changed**: `packages/shared/src/validation/common.ts`'s
`cuidSchema` no longer enforces the literal cuid character format
(`z.string().cuid()`) — it's now `z.string().trim().min(1).max(191)`.

**Why**: `apps/server/prisma/seed.ts` intentionally uses human-readable
ids for dev fixtures (`"seed-case-1"`, `"general-cockroach-treatment"`,
...) so a developer can reference them by hand while testing by hitting
the API directly. Strict cuid validation rejected those as 400s the
instant this session tried to `POST /cases/:id/treatments` with
`treatmentId: "general-cockroach-treatment"` during manual smoke testing
— a real bug caught and fixed, not a hypothetical. Loosening the
validator also decouples the API contract from a specific id-generation
algorithm (could move to UUIDs later without touching every Zod schema).
A well-formed-but-unknown id still 404s from the Prisma lookup either way.

### 3.7 `CaseActivity` — a dedicated timeline/audit model (session 2, new)

The brief asked "consider whether a dedicated activity/event model is
useful" for reconstructing the case timeline (creation, scheduling, visit
started, inspection completed, photos uploaded, remarks added, treatment
selected/performed, follow-up scheduled/completed, resolution).

**Decision: yes**, added `CaseActivity` (`apps/server/prisma/schema.prisma`,
`packages/shared/src/enums.ts`'s `CaseActivityType`, 15 event kinds).
Append-only, one row per meaningful thing that happens to a case, always
written **in the same Prisma transaction** as the mutation it describes
(`apps/server/src/modules/cases/case-activity.ts`'s `logCaseActivity`) —
never a best-effort side effect, so the timeline can never drift from what
actually happened or go missing if a later step in the same request fails.

Each row carries a server-generated human-readable `message` (not
derived generically from `type` at read time — written in plain English
at the call site, e.g. `"Initial Inspection visit scheduled for
2026-09-11T13:50:36.000Z"`), an optional `metadata` JSON blob (e.g.
`{visitId}`) for consumers that want structured detail, and an optional
`actorId` (null for the rare system-derived event, though every event in
practice today has a real actor). Exposed via `GET /cases/:id/timeline`
and embedded (fully, ordered) in `GET /cases/:id` under `activities`.

This is the mechanism that actually satisfies "make the workflow
explicit" — the coarse `Case.status` enum was never going to carry that
by itself.

### 3.8 `POST /cases` accepts existing OR new customer/property (session 2, new)

Brief's manual intake workflow always nests a brand-new customer +
property. In practice a manager often reports on an existing customer
(repeat call) or an already-serviced property (rental turnover) — so
`createCaseSchema` (`packages/shared/src/validation/case.ts`) accepts
`customerId` **or** `customer` (nested new-customer object), same for
`property`/`propertyId`, enforced via `superRefine` (exactly one of each
pair, clear per-field error messages rather than a discriminated-union
dump). `property.landlordId` vs `property.landlord` works the same way
one level down.

### 3.9 `DELETE /cases/:id/treatments/:treatmentId` → keyed by the join row's own id (session 2, deviation)

Brief's literal path suggests deleting by the catalog `treatmentId`. Since
a case could in principle have the same catalog treatment attached more
than once across multiple rounds, that's ambiguous. Implemented as
`DELETE /cases/:id/treatments/:caseTreatmentId` — keyed by
`CaseTreatment.id`, the join row's own unambiguous id. Same reasoning
applies to the `PATCH` "record execution" endpoint.

### 3.10 Extra endpoints beyond the brief's example list (session 2, additions)

The brief said "do not blindly follow this endpoint list if REST/domain
conventions suggest something better." Additions made:

- `GET/PATCH /landlords/:id` — brief only showed `GET/POST`; added for
  parity with customers/properties (an admin needs to fix a landlord's
  phone number eventually).
- `POST /users`, `GET/PATCH /users/:id`, `GET /users` — not in the
  brief's example list at all, but required by "Admin: manage workers"
  and by there being no self-registration (accounts only exist because an
  admin created them).
- `POST /auth/change-password` — self-service password rotation, not
  listed but a basic security expectation once auth exists; revokes every
  other refresh token for that user on success.
- `POST /visits/:id/inspection` — brief listed this explicitly; it's
  additionally reachable through `POST /visits/:id/complete` (which
  accepts the same three fields inline) since a worker filling in the
  inspection is almost always also completing the visit in the same
  moment — both paths `upsert` the same `Inspection` row.

## 4. Realtime design (Socket.IO) — now wired

Session 1 built the transport skeleton only. **Session 2 wires real
emits**: `apps/server/src/realtime/socket.ts` exports
`emitCaseCreated/emitCaseUpdated/emitVisitCreated/emitVisitUpdated`,
called from `cases.routes.ts` / `visits.routes.ts` / `case-treatments`
mutations after each successful write. All helpers no-op quietly if
`initSocket()` was never called (true in tests, which build the Express
app directly via `createApp()` without booting an HTTP+Socket.IO server —
an HTTP request must never fail because of realtime). Event shape
unchanged from session 1's design: `cases` room for list-level changes,
`case:${caseId}` room for a specific case's detail view.

**Not done**: no client (desktop/mobile) actually calls `socket.emit(
JOIN_CASE_ROOM, ...)` or listens for these events yet — that's UI wiring,
next session.

## 5. File storage — still just the abstraction boundary, no driver yet

Unchanged from session 1: `STORAGE_DRIVER=local` env var exists and is
validated at boot, `/uploads` is statically served from
`STORAGE_LOCAL_ROOT`, but there is still no `src/storage/` module and no
binary upload endpoint. **Session 2's `POST /visits/:id/photos` is
metadata-only** (`AddVisitPhotoInput`: `storageKey`, optional `url`,
optional `caption`) — matches the brief's item 13, "Photos metadata", not
a binary upload. When the storage driver is eventually built, this
endpoint stays the same shape; only where `storageKey` comes from changes
(a prior upload step returns it instead of the client making one up).

## 6. Authentication — implemented (session 2)

- **Password hashing**: Argon2id (`apps/server/src/lib/password.ts`,
  argon2's own default — stronger than bcrypt against GPU cracking at
  equivalent cost).
- **Access token**: JWT, `{sub, role}`, signed with `JWT_ACCESS_SECRET`,
  short TTL (`JWT_ACCESS_TTL`, default 15m). Verified by `requireAuth`
  middleware (`apps/server/src/middleware/auth.ts`) reading
  `Authorization: Bearer <token>`.
- **Refresh token**: JWT, `{sub, jti}`, signed with a **different**
  secret (`JWT_REFRESH_SECRET`), long TTL (default 30d). The DB
  (`RefreshToken` table) stores only `sha256(token)` — never the raw
  token — plus `expiresAt`/`revokedAt`, keyed by `jti` (the token's own
  claim, used as the row's primary key). A DB leak alone can't be
  replayed as a working session.
- **Rotation + reuse detection**
  (`apps/server/src/modules/auth/auth.service.ts`): every
  `POST /auth/refresh` revokes the presented token and issues a brand new
  pair. If an **already-revoked** (previously-rotated-away) token is
  presented again, that's treated as a possible theft signal — every
  refresh token for that user is immediately revoked, forcing a fresh
  login everywhere. Verified by a real test
  (`tests/auth.test.ts` "reuse of a rotated-away token revokes every
  session for that user").
- **Rate limiting**: `POST /auth/login` and `POST /auth/refresh` are
  behind `authRateLimiter` (`apps/server/src/middleware/rateLimit.ts`) —
  20 requests / 15 min per IP, then `429` with a clean JSON body.
  Confirmed by manual testing (21 rapid logins → the 18th genuine 401s
  become `429`s at request 18-21 in the actual run, exact cutoff depends
  on the window).
- **`GET /me`**, **`POST /auth/change-password`**: see section 3.10.
- **Never exposes `passwordHash`**: every route that returns a `User`
  goes through `toPublicUser()` (`apps/server/src/lib/serialize.ts`),
  which strips it. Verified by a test asserting
  `res.body.user).not.toHaveProperty("passwordHash")`.
- **CORS**: `CLIENT_ORIGIN` is now a comma-separated list
  (`apps/server/src/config/env.ts`'s `clientOrigins`), so desktop's Vite
  dev server, Expo web, and a packaged app's custom origin can all be
  allow-listed simultaneously. Requests with no `Origin` header (native
  mobile fetch, curl, server-to-server) are always allowed — that's not a
  CORS concern.

## 7. Authorization model

No permissions table — every check is either a role check
(`requireRole`/`requireAdmin` middleware) or derived directly from the
data ("is this user assigned to a visit on this case").

**Two access-scoping helpers** (`apps/server/src/lib/authz.ts`):

- `assertCaseAccess(caseId, requester)` — ADMIN always passes; WORKER
  passes only if they're `assignedWorkerId` on **at least one visit** on
  that case. Used by `GET /cases/:id`, `GET /cases/:id/timeline`, and the
  "record treatment execution" `PATCH /cases/:id/treatments/:id` route.
- `assertVisitAccess(visit.assignedWorkerId, requester)` — stricter:
  ADMIN always passes; WORKER passes only if they are assigned to **that
  specific visit**. Used by `GET /visits/:id`,
  `POST /visits/:id/{start,complete,inspection,photos}`.

Note the asymmetry is deliberate: a worker assigned to *any* visit on a
case can see the *whole* case (customer, property, full visit history —
"see previous visits" from the brief) via `GET /cases/:id`, but can only
act on (start/complete/photo/inspect) the specific visit they're assigned
to, not a colleague's visit on the same case.

**Admin-only routes** (`requireAdmin`, i.e. `requireRole("ADMIN")`):
all of `/users`, `/customers`, `/landlords`, `/properties`; `POST/PATCH
/treatments` (GET is open to any authenticated role — a worker needs to
read instructions/safety info while performing a visit); `POST /cases`;
`PATCH /cases/:id` (including the two lifecycle actions, resolve and
cancel); `POST /visits` (schedule); `PATCH /visits/:id` (reschedule/
reassign/cancel); `POST /cases/:id/treatments` and `DELETE
/cases/:id/treatments/:id` (choosing/removing treatments). A worker
attempting any of these gets a clean `403 FORBIDDEN`, never a 404 or 500
— confirmed by `tests/authorization.test.ts`'s parameterized sweep.

**Worker-accessible routes**: `GET /cases` and `GET /visits` (list, but
silently forced to their own `assignedWorkerId` regardless of what query
params they send — they can never list someone else's cases/visits by
guessing an id); `GET /cases/:id`, `GET /cases/:id/timeline`,
`GET /visits/:id` (via the access helpers above); `POST /visits/:id/
{start,complete,inspection,photos}`; `PATCH /cases/:id/treatments/:id`
(record execution only — adding/removing stays admin); `GET /treatments`;
`GET /me`, `POST /auth/change-password`.

## 8. Backend API

All routes are mounted under `/api` (`apps/server/src/routes/index.ts`).
Every list endpoint returns `{items, page, pageSize, total}`
(`Paginated<T>`, `packages/shared/src/validation/common.ts`). Every error
returns `{error: {message, code, details?}}` — `details` is present and
field-keyed for Zod validation failures (400, `VALIDATION_ERROR`).

```
Auth (public except change-password)
  POST   /auth/login              rate-limited
  POST   /auth/refresh            rate-limited, rotates + reuse-detects
  POST   /auth/logout             idempotent even on an already-dead token
  POST   /auth/change-password    requireAuth; revokes all other sessions
  GET    /me                      requireAuth

Users (ADMIN only)
  GET    /users            ?role=&active=&page=&pageSize=
  POST   /users
  GET    /users/:id
  PATCH  /users/:id         guards against an admin locking themself out

Customers / Landlords / Properties (ADMIN only)
  GET    /customers | /landlords | /properties      ?search=&page=&pageSize=
  POST   /customers | /landlords | /properties
  GET    /customers/:id | /landlords/:id | /properties/:id
  PATCH  /customers/:id | /landlords/:id | /properties/:id

Treatments (GET: any authenticated role; POST/PATCH: ADMIN)
  GET    /treatments        ?active=&search=&page=&pageSize=
  POST   /treatments
  GET    /treatments/:id
  PATCH  /treatments/:id

Cases
  GET    /cases                      ?status=&assignedWorkerId=&search=&page=&pageSize=
                                      (worker: assignedWorkerId forced to self)
  POST   /cases                      ADMIN only — manual intake, see 3.8
  GET    /cases/:id                  full detail incl. activities — see authz
  PATCH  /cases/:id                  ADMIN only — edits + resolve/cancel/reopen
  GET    /cases/:id/timeline         ordered CaseActivity[]

  POST   /cases/:id/treatments                 ADMIN only — choose a treatment
  PATCH  /cases/:id/treatments/:caseTreatmentId ADMIN or assigned worker — record execution
  DELETE /cases/:id/treatments/:caseTreatmentId ADMIN only

Visits
  GET    /visits             ?caseId=&assignedWorkerId=&status=&type=&from=&to=&page=&pageSize=
                              (worker: assignedWorkerId forced to self;
                               from/to power mobile's Today/Upcoming)
  POST   /visits              ADMIN only — schedule, optional assignedWorkerId
  GET    /visits/:id          ADMIN or the assigned worker
  PATCH  /visits/:id          ADMIN only — reschedule/reassign/cancel/notes
  POST   /visits/:id/start                 assigned worker (or ADMIN)
  POST   /visits/:id/complete              assigned worker (or ADMIN) — optional inline inspection
  POST   /visits/:id/inspection            assigned worker (or ADMIN) — record/update inspection standalone
  POST   /visits/:id/photos                assigned worker (or ADMIN) — metadata only, see section 5

Health
  GET    /health              public, checks real DB connectivity
```

## 9. Case status state machine + timeline

`apps/server/src/modules/cases/case-status.ts`:

- `recalculateCaseStatus(tx, caseId, actorId?)` — called after **every**
  visit create/schedule/start/complete/reschedule/cancel, inside the same
  transaction as that mutation. No-ops if the case is already RESOLVED or
  CANCELLED (terminal). Otherwise derives the bucket from the case's
  current visits:
  - no visits at all → `NEW`
  - has a `SCHEDULED`/`IN_PROGRESS` visit, none `COMPLETED` yet →
    `SCHEDULED`
  - has at least one `COMPLETED` visit → `IN_PROGRESS`

  If the derived value differs from the stored one, updates it and logs a
  `STATUS_CHANGED` activity with `metadata: {from, to, reason: "auto"}`.
  This is what makes an arbitrary number of inspection → treatment →
  follow-up loops "just work" without new enum values.

- `applyExplicitStatus(tx, caseId, status, actorId)` — the two admin-only
  lifecycle actions (resolve/cancel), plus reopening. Sets/clears
  `resolvedAt`, logs `CASE_RESOLVED`/`CASE_CANCELLED`/`STATUS_CHANGED`
  with `reason: "manual"`.

`PATCH /cases/:id` with a `status` field calls `applyExplicitStatus`;
every other status change in the system is automatic via
`recalculateCaseStatus`. A route handler never does `case.status = X`
directly outside these two functions.

Verified end-to-end by `tests/workflow.test.ts`, which drives a case
through NEW → SCHEDULED → IN_PROGRESS → SCHEDULED (2nd visit) →
IN_PROGRESS → RESOLVED, confirming the loop doesn't get stuck and that a
RESOLVED case rejects a new visit (`POST /visits` → 400).

## 10. What's built (session 2 — this session)

### packages/shared additions
- `CaseActivityType` enum (15 values) + `CASE_ACTIVITY_TYPE_LABELS`.
- `CaseActivity` type, `CaseWithRelations.activities`, `.visits[].
  assignedWorker/inspection`.
- `createCaseSchema` rewritten for existing-or-new customer/property (3.8).
- New/changed validation: `visitListQuerySchema`, `caseListQuerySchema`
  (now paginated), `peopleListQuerySchema`, `userListQuerySchema`,
  `treatmentListQuerySchema`, `createCustomerSchema`/`createLandlordSchema`/
  `createPropertySchema` (previously only `update*` existed),
  `recordInspectionSchema` (replaces the old `createInspectionSchema`),
  `addVisitPhotoSchema` (replaces `uploadPhotoMetaSchema`).
- `booleanQueryParam` in `validation/common.ts` — fixes a real bug: `z.
  coerce.boolean()` makes `?active=false` mean `true` (`Boolean("false")
  === true` in JS). Used by `active=` filters on `/users` and
  `/treatments`.
- `cuidSchema` loosened — see 3.6.

### apps/server additions
- `prisma/schema.prisma`: `CaseActivity` model + `CaseActivityType` enum,
  `User.caseActivities` relation. Two migrations this session:
  `20260911113701_add_case_activity` (only schema change needed —
  everything else uses the session-1 tables as-is).
- `prisma/seed.ts`: now also seeds a WORKER login
  (`worker@msph.local`/`ChangeMe123!`) and one sample case
  (`seed-case-1`) with a scheduled initial inspection assigned to that
  worker, plus fixed treatment ids.
- `src/lib/`: `password.ts` (Argon2), `jwt.ts` (sign/verify access +
  refresh, `hashToken`), `serialize.ts` (`toPublicUser`),
  `pagination.ts` (`paginationArgs`/`toPaginated`), `authz.ts` (section
  7), `assertExists.ts` (FK-lookup-before-write helper — turns a bad
  foreign id into a clean 400 instead of a raw Postgres FK-violation
  500).
- `src/middleware/auth.ts` (`requireAuth`, `requireRole`, `requireAdmin`),
  `src/middleware/rateLimit.ts` (`authRateLimiter`). `validate.ts`
  extended with `body<T>(req)`/`query<T>(req)` typed accessors (every
  route reads the Zod-validated body/query through these instead of
  inline casts).
- `src/modules/`: `auth/` (service + routes + `me.routes.ts`), `users/`,
  `customers/`, `landlords/`, `properties/`, `treatments/`, `cases/`
  (`cases.service.ts`, `case-treatments.service.ts`, `case-status.ts`,
  `case-activity.ts`, `cases.routes.ts`), `visits/`
  (`visits.service.ts`, `visits.routes.ts`). Every module follows the
  same routes-call-service, service-owns-Prisma-and-transactions
  pattern.
- `src/realtime/socket.ts`: real emit helpers, see section 4.
- `src/app.ts`: multi-origin CORS (section 6), morgan silenced under
  `NODE_ENV=test`.
- **Tests**: `vitest.config.ts` (env injected via `test.env`, see
  "Testing" below), `tests/setup.ts` (truncate-all-tables
  `beforeEach`), `tests/helpers.ts` (fixture factories:
  `createAdmin`/`createWorker`/`createCustomerFixture`/etc.,
  `authHeader`), and 5 test files — `auth.test.ts`,
  `authorization.test.ts`, `cases.test.ts`, `visits.test.ts`,
  `workflow.test.ts` — 36 tests total, all passing.
- `tsconfig.test.json` — separate typecheck pass covering `src` + `tests`
  together (main `tsconfig.json`'s `rootDir: "src"` can't include tests).

## 11. Testing

**Framework**: vitest + supertest, real Postgres (a dedicated `msph_test`
database — never `msph_dev`), no Prisma mocking. Tests go through the
actual Express app (`createApp()`) and actual service/Prisma/DB stack —
this is what actually proves the authorization and workflow logic works,
not a mock's approximation of it.

**One-time setup** (already done in this dev container, needed again on a
fresh machine):
```bash
psql -c "CREATE DATABASE msph_test OWNER msph;"
DATABASE_URL="postgresql://msph:msph_dev_password@localhost:5432/msph_test?schema=public" \
  pnpm --filter @msph/server exec prisma migrate deploy
```

**Running**: `pnpm --filter @msph/server test` (or `test:watch`). Env vars
(`DATABASE_URL` pointed at `msph_test`, JWT secrets, etc.) are injected by
`vitest.config.ts`'s `test.env` — set before any module evaluates, so
`src/config/env.ts`'s own `dotenv/config` load of `apps/server/.env`
never overrides them (dotenv doesn't clobber already-set vars). No
`.env.test` file needed.

**Isolation**: `tests/setup.ts`'s `beforeEach` truncates every app table
(children-first FK order, one transaction) — each test starts from an
empty database and never depends on another test's leftover state.
`fileParallelism: false` in the vitest config because all test files
share one database.

**Coverage** (36 tests / 5 files, all passing):
- `auth.test.ts` — login success/failure/inactive-user/malformed-body,
  refresh rotation + reuse-detection (2 tests), `GET /me` auth
  requirement + garbage-token rejection.
- `authorization.test.ts` — parameterized sweep of 9 admin-only routes
  asserting a worker gets 403 on each, admin gets through on a sample,
  no-token gets 401, worker CAN read `/treatments`.
- `cases.test.ts` — create with new customer+property, create with
  existing ids, create-with-initial-visit (status → SCHEDULED),
  validation (neither/both customer forms), admin-only enforcement.
- `visits.test.ts` — schedule → status auto-transition, worker can't
  schedule, full access-scoping matrix (no access / assigned / a
  *different* worker still denied / can't start someone else's visit),
  start → complete → inspection recorded → case IN_PROGRESS →
  timeline has the right event types in it.
- `workflow.test.ts` — the brief's full "Done criteria" walkthrough as
  one test: intake → schedule → assign → inspect → treatment chosen →
  treatment performed → follow-up visit (2nd loop through
  SCHEDULED/IN_PROGRESS) → worker blocked from resolving → admin resolves
  → resolution is terminal (new visit rejected) → timeline has every
  expected event type in the right order.

**Not covered by automated tests** (verified manually instead, via a full
curl walkthrough during this session — see git history / this section's
predecessor in the conversation, not reproduced as a script): Socket.IO
emits (no test client wired up), rate-limiter's exact request-count
threshold (confirmed manually: 21 rapid bad logins → requests 18-21
returned 429), CORS origin rejection.

## 12. Current status — verified working end-to-end (session 2)

Everything from session 1's "Current status" still holds (server ↔
Postgres, desktop Electron launch under Xvfb, mobile Metro bundler) and
was spot-checked again this session. New this session:

- `pnpm -r typecheck` from repo root — all 4 packages (shared, server,
  desktop, mobile) clean, including `apps/server/tsconfig.test.json`
  (tests typecheck too, not just `src`).
- `pnpm --filter @msph/server test` — 36/36 passing.
- Full manual curl walkthrough of the brief's exact "Done criteria" list
  against a running dev server (start Postgres → migrate → seed → start
  server → login as admin → login as worker → worker denied `/users`
  (403) → create case → schedule visit assigned to worker → case status
  NEW→SCHEDULED confirmed → worker denied case access before assignment
  (403) → worker granted after assignment (200) → worker starts visit →
  worker completes visit with inspection fields → case status
  SCHEDULED→IN_PROGRESS confirmed → admin adds treatment → worker records
  it performed → worker adds photo metadata → worker denied adding a
  treatment (403, admin-only) → full timeline fetched and read back in
  order → worker denied resolving (403) → admin resolves → resolved case
  rejects a new visit (400) → refresh-token rotation + reuse-detection
  both confirmed live → rate limiter confirmed live (429 after 20
  attempts in 15 min)). This is the same walkthrough the automated tests
  now cover, run once by hand first to catch what tests alone might miss
  (real HTTP headers, real timing, the cuid-validation bug in 3.6 was
  actually found this way, before tests were even written).
- Dev database (`msph_dev`) reset and reseeded clean at the end of the
  session — contains exactly the seed script's fixtures, no leftover
  manual-testing cruft.
- All background processes (dev server, etc.) stopped after verification.

**Still not done**: desktop/mobile don't call any of this API yet beyond
the session-1 health check. No storage driver (photos are metadata-only).
No ESLint. See Next steps.

## 13. Known issues / gotchas

Session 1's gotchas (9.1–9.5 in the previous revision of this file) still
apply unchanged — Electron `.cts`→`.cjs` requirement, the `packageManager`
pin, the harmless `@types/react-dom` peer warning, no ESLint yet, desktop's
redundant `tsc -b` emit. Not repeated here in full; read the git history
of this file (or just trust that the fixes described there are still in
place — nothing this session touched apps/desktop or apps/mobile).

**New this session:**

- **`z.coerce.boolean()` is a trap for query params** — fixed via
  `booleanQueryParam` in shared validation (section 10). If you ever add
  another boolean query filter, use that, not `z.coerce.boolean()`.
- **Service-layer return types are NOT annotated with the shared "wire"
  entity types** (`Customer`, `User`, `Treatment`, etc.) — those types
  describe the post-`JSON.stringify()` shape (ISO date strings); Prisma
  returns real `Date` objects. Annotating e.g. `getCustomer(id):
  Promise<Customer>` is a type lie that `tsc` correctly rejects (hit and
  fixed this exact error across 6 files this session). Service functions
  are left to infer Prisma's actual return shape; `res.json()` performs
  the real Date→string conversion at the actual API boundary, where the
  shared type's contract genuinely applies. See the comment atop
  `customers.service.ts` for the canonical explanation, referenced from
  the other service files.
- **`tsc -b`'s `rootDir: "src"` can't also typecheck `tests/`** — solved
  with a separate `tsconfig.test.json` (`include: ["src", "tests"]`,
  `noEmit: true`, no `rootDir`/`outDir`) run as a second step in the
  `typecheck` script.
- **`tsx watch` watches across the workspace symlink into
  `packages/shared/dist`**, which is neat (edit shared, server hot
  -reloads) but means rebuilding shared while the dev server is running
  can race: `rm -rf dist && tsc -b` triggers tsx's restart on the
  `unlink` the instant `dist/index.js` disappears, before `tsc` finishes
  recreating it, crashing with `ERR_MODULE_NOT_FOUND`. Not a bug in the
  app — just kill the dev server before rebuilding shared, then start it
  fresh, rather than expecting the watcher to survive the rebuild.
- **Prisma's `Json?` field type (`Prisma.InputJsonValue`) does not
  include `null`** the way you'd expect (`null` needs the separate
  `Prisma.JsonNull` sentinel) — `CaseActivity.metadata`'s type is
  `Record<string, Prisma.InputJsonValue>`, so a call site that might
  otherwise pass `workerId: string | null` conditionally spreads the key
  in instead (`...(x ? {workerId: x} : {})`) rather than ever assigning
  `null` into it. See `visits.service.ts`'s `updateVisit`.

## 14. Next steps (recommended order for the next session)

1. **Wire the desktop UI to the real API.** `CasesPage`, a real case
   detail screen (timeline from `GET /cases/:id/timeline` + the brief's
   visual request→consultation→inspection→treatment→follow-up→resolution
   flow, built from the ordered `visits`/`activities` arrays — the data
   for this now fully exists), `CustomersPage`, `PropertiesPage`,
   `LandlordsPage`, `WorkersPage`, `TreatmentsPage`, a real login screen
   (JWT storage — likely `localStorage` or Electron's `safeStorage` via a
   preload-exposed API, access-token refresh-on-401 interceptor around
   `lib/api.ts`). `DashboardPage`'s bucket counts can finally be wired to
   `GET /cases?status=X`.
2. **Wire the mobile UI to the real API.** Real login (`app/login.tsx`
   currently a no-op stub), Today/Upcoming screens from
   `GET /visits?assignedWorkerId=me&from=...&to=...` (note: workers'
   `assignedWorkerId` is forced server-side, so the client doesn't even
   need to pass its own id — any value works, but passing the real one is
   clearer), visit detail screen wired to start/complete/inspection/
   photos, JWT storage via `expo-secure-store` (not installed yet —
   `AsyncStorage`/`localStorage` are not appropriate for refresh tokens
   on a phone).
3. **Wire Socket.IO on the client side** — join `cases` room on
   dashboard mount, `case:${id}` room on case-detail mount (desktop);
   consider whether mobile needs it at all yet (Today screen could just
   poll, given field connectivity is often spotty — reconnect-heavy
   Socket.IO on cellular may be more trouble than it's worth for v1;
   decide when building it, don't assume).
4. **Storage driver** (section 5): build
   `apps/server/src/storage/index.ts` (a `StorageDriver` interface —
   `put`, `getUrl`, maybe `delete`) + `LocalStorageDriver`, then a real
   binary upload endpoint (multipart, `multer` or Busboy) that returns a
   `storageKey` for `POST /visits/:id/photos` to consume. Wire mobile's
   camera capture (`expo-image-picker` is already a dependency, Android
   `CAMERA` permission already declared in `app.json`).
5. **ESLint/Prettier** (carried over from session 1, still not done).
6. Eventually: S3/R2 storage driver, email ingestion, calendar view,
   Electron packaging (`electron-builder`) for distributable installers,
   an `OWNER` role tier if the business ever needs one (see 3.2).

## 15. Commands reference

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
pnpm dev:desktop     # Electron + Vite
pnpm dev:mobile      # Expo — scan QR or press w/a/i in the terminal

# Checks
pnpm typecheck                                   # every package
pnpm --filter @msph/server test                  # backend test suite
pnpm --filter @msph/server prisma:studio         # DB browser GUI
pnpm --filter @msph/desktop build                # production build check
pnpm --filter @msph/mobile exec expo export --platform web   # bundle check

# Local Postgres in THIS dev container (already created)
service postgresql start
# role: msph / msph_dev_password, dbs: msph_dev, msph_test

# Default logins (seeded)
# admin@msph.local / ChangeMe123!  (ADMIN)
# worker@msph.local / ChangeMe123! (WORKER)
```

## 16. Environment variables

See `.env.example` at repo root for the full documented list — copy it to
`apps/server/.env` and fill in real values. Never commit `.env` files
(already gitignored) or hardcode secrets in code. Test env vars are
injected directly by `vitest.config.ts`, not read from a file — see
section 11.
