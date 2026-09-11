# MSPH backend — production image.
#
# This is a pnpm-workspace monorepo, so the build context MUST be the
# REPO ROOT, not apps/server/ — packages/shared is a workspace dependency
# (`workspace:*`) that has to be visible to the build. Build from the repo
# root:
#
#   docker build -f apps/server/Dockerfile -t msph-server .
#   docker run --rm -p 4000:4000 --env-file apps/server/.env msph-server
#
# Directory layout is kept identical to the source repo throughout every
# stage (everything lives under /repo, never remapped to /app) — pnpm's
# node_modules is a tree of symlinks into a shared .pnpm store, and
# preserving relative paths is what keeps those symlinks valid after
# `COPY --from=`.
#
# Base image is Debian-based (`node:20-bookworm-slim`), NOT Alpine.
# Prisma's engine binaries are notoriously unreliable on Alpine (musl
# libc + its OpenSSL packaging) — the exact failure mode is "Prisma
# failed to detect the libssl/openssl version" followed by the schema
# engine crashing on startup with a non-JSON error the CLI can't parse.
# This isn't a version-pinning problem to work around with
# `binaryTargets`; Prisma's own docs recommend a glibc-based image
# instead, which is what this does (found by actually deploying this
# image to Railway and hitting exactly that crash — see CONTEXT.md
# session 8).
#
# See CONTEXT.md "Production deployment" for the full explanation of each
# stage and how this fits Railway/Render/Fly.io/a plain VPS.

FROM node:20-bookworm-slim AS base
# `openssl` installed here (inherited by both `deps`->`build` and
# `prod-deps` below) because `prisma generate` in those stages needs the
# real library present to auto-detect the right engine for the `native`
# binaryTarget — without it, detection silently guesses wrong (this is
# what actually broke production: generate guessed "debian-openssl-1.1.x"
# in a stage with no openssl installed, but the runtime stage correctly
# detected 3.0.x, and the two didn't match). schema.prisma also now pins
# `binaryTargets = ["native", "debian-openssl-3.0.x"]` explicitly as a
# second, independent safety net — see its own comment.
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/*
WORKDIR /repo

# ---------------------------------------------------------------------
# deps — full (dev+prod) install, needed to compile TypeScript. Package
# manifests are copied before the rest of the source so this layer is
# cached across source-only changes (the common case during iteration).
# ---------------------------------------------------------------------
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
RUN pnpm install --frozen-lockfile

# ---------------------------------------------------------------------
# build — compile packages/shared then apps/server, generate the Prisma
# client against the real schema.
# ---------------------------------------------------------------------
FROM deps AS build
COPY packages/shared packages/shared
COPY apps/server apps/server
RUN pnpm --filter @msph/shared build \
 && pnpm --filter @msph/server prisma:generate \
 && pnpm --filter @msph/server build

# ---------------------------------------------------------------------
# prod-deps — a second, production-only install (no vitest/tsx/typescript
# etc. in the final image) plus its own Prisma client generation (the
# generated client is tied to whichever copy of @prisma/client is
# physically on disk in THIS install, not carried over from `build`).
# ---------------------------------------------------------------------
FROM base AS prod-deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/package.json
COPY apps/server/package.json apps/server/package.json
RUN pnpm install --frozen-lockfile --prod
COPY apps/server/prisma apps/server/prisma
RUN pnpm --filter @msph/server prisma:generate

# ---------------------------------------------------------------------
# runtime — the actual production image. Non-root user, only compiled
# output + production node_modules, no source/tests/dev tooling.
# `openssl` installed here too — this is the library the query engine
# actually dynamically links against at request time, not just what
# `prisma generate` needs to pick the right engine (see `base`'s comment
# for that half of the story).
# ---------------------------------------------------------------------
FROM node:20-bookworm-slim AS runtime
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends openssl \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd -r msph && useradd -r -g msph msph
WORKDIR /repo
ENV NODE_ENV=production

COPY --from=prod-deps /repo/node_modules ./node_modules
COPY --from=prod-deps /repo/packages/shared/node_modules ./packages/shared/node_modules
COPY --from=prod-deps /repo/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /repo/packages/shared/dist ./packages/shared/dist
COPY --from=build /repo/packages/shared/package.json ./packages/shared/package.json
COPY --from=build /repo/apps/server/dist ./apps/server/dist
COPY --from=build /repo/apps/server/prisma ./apps/server/prisma
COPY --from=build /repo/apps/server/package.json ./apps/server/package.json
COPY pnpm-workspace.yaml package.json ./

# Only relevant for STORAGE_DRIVER=local (dev/small-deployment default —
# see config/env.ts). Owned by the non-root user so a bind-mounted volume
# at this path (recommended even for "local" storage in production — a
# container filesystem is otherwise ephemeral) is writable.
RUN mkdir -p /repo/apps/server/storage/uploads && chown -R msph:msph /repo

USER msph
WORKDIR /repo/apps/server

EXPOSE 4000
ENV PORT=4000

# `prisma migrate deploy` only applies already-committed, already-reviewed
# migrations (never generates new ones, never prompts) — safe to run on
# every container start, including redundantly across multiple replicas
# (a no-op once a migration's already applied). See CONTEXT.md "Database"
# for why this runs here rather than as a separate CI/CD release step:
# simplest correct option for the single-instance deployment this
# checklist targets: Railway/Render/Fly.io's "one service, one process"
# default. A multi-replica deployment should instead run migrations as a
# one-off release-phase command before scaling up new replicas — the
# platforms above all support that as a documented alternative.
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy --schema=prisma/schema.prisma && node dist/index.js"]
