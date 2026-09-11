# MSPH

Internal field-service management system for a disinfection / pest-control
company: intake, inspections, treatments, follow-ups and resolution
tracking, shared by an office desktop app and a worker-facing mobile app.

See [`CONTEXT.md`](./CONTEXT.md) for the full project memory — architecture
decisions, what's built, what's next. Read it before starting new work.

## Monorepo layout

```
apps/
  server/    Express + TypeScript + Prisma + Socket.IO — source of truth
  desktop/   Electron + React + Vite — manager/admin app
  mobile/    Expo + React Native — worker field app
packages/
  shared/    Domain types, Zod validation schemas, constants (used by all three apps)
```

The desktop and mobile apps hold no business logic or local database — every
read/write goes through the server's HTTP API.

## Prerequisites

- Node.js >= 20
- pnpm (`corepack enable` or install per `packageManager` in `package.json`)
- PostgreSQL 14+ running locally (or reachable via `DATABASE_URL`)

## First-time setup

```bash
pnpm install

# Server: copy env and point it at your Postgres instance
cp .env.example apps/server/.env
# edit apps/server/.env — DATABASE_URL, JWT secrets, etc.

pnpm --filter @msph/server prisma:migrate   # creates the database schema
pnpm --filter @msph/server prisma:seed      # admin + worker logins, sample treatments/case

# Tests run against a separate database — create it once:
createdb -O msph msph_test   # or: psql -c "CREATE DATABASE msph_test OWNER msph;"
DATABASE_URL="postgresql://msph:msph_dev_password@localhost:5432/msph_test?schema=public" \
  pnpm --filter @msph/server exec prisma migrate deploy
```

## Running things

```bash
pnpm dev:server     # Express API on http://localhost:4000 (health: /api/health)
pnpm dev:desktop    # Electron app (Vite dev server + Electron window)
pnpm dev:mobile     # Expo dev server (scan the QR code, or press w/a/i)
```

`pnpm dev` runs the server and desktop app together. Run mobile separately —
Expo's own terminal UI doesn't play well multiplexed with the others.

## Other useful commands

```bash
pnpm typecheck                              # typecheck every package
pnpm --filter @msph/server test             # backend test suite (vitest + supertest)
pnpm --filter @msph/server prisma:studio    # browse the database
pnpm build                                  # build shared + server for production
```

## Default dev logins

Seeded by `prisma:seed` (see `apps/server/prisma/seed.ts`), password
`ChangeMe123!` for both:

- `admin@msph.local` — ADMIN
- `worker@msph.local` — WORKER

The backend's full REST API (auth, users, customers, landlords,
properties, cases, visits, inspections, treatments, photo metadata) is
implemented and tested — see CONTEXT.md "Backend API" for the endpoint
list and "Domain decisions" for the authorization model. The desktop/
mobile UIs don't call it yet (still placeholder screens) — see
CONTEXT.md "Next steps".
