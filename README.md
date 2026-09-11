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
pnpm --filter @msph/server prisma:seed      # optional: admin user + starter treatments
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
pnpm --filter @msph/server prisma:studio    # browse the database
pnpm build                                  # build shared + server for production
```

## Default dev login

Seeded by `prisma:seed` (see `apps/server/prisma/seed.ts`):

- email: `admin@msph.local`
- password: `ChangeMe123!`

Login isn't wired up in the UI yet — see CONTEXT.md "Next steps".
