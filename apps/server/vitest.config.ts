import { defineConfig } from "vitest/config";

/**
 * Tests run against a real Postgres database (`msph_test`, not
 * `msph_dev`) — see tests/setup.ts for schema/teardown and
 * CONTEXT.md "Testing" for the one-time `msph_test` setup command.
 * No mocking of Prisma: these are integration tests through the real
 * Express app (supertest) down to the real database, which is what
 * actually proves the auth/authorization/workflow logic works.
 *
 * Env vars are injected here (not via a .env.test file) so they're set
 * before any module — including src/config/env.ts, which loads
 * apps/server/.env via `dotenv/config` — ever evaluates. dotenv never
 * overrides an already-set process.env value, so these win regardless
 * of what's in .env.
 */
export default defineConfig({
  test: {
    globals: false,
    environment: "node",
    include: ["tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    testTimeout: 15_000,
    // Sequential: tests share one database and truncate it between
    // files (see tests/setup.ts) — parallel workers would race.
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      // Never actually bound (tests call createApp() directly, never
      // app.listen()) — just needs to pass env validation.
      PORT: "4999",
      CLIENT_ORIGIN: "http://localhost:5173",
      DATABASE_URL: "postgresql://msph:msph_dev_password@localhost:5432/msph_test?schema=public",
      JWT_ACCESS_SECRET: "test-access-secret-at-least-16-chars",
      JWT_REFRESH_SECRET: "test-refresh-secret-at-least-16-chars",
      JWT_ACCESS_TTL: "15m",
      JWT_REFRESH_TTL: "30d",
      STORAGE_DRIVER: "local",
      STORAGE_LOCAL_ROOT: "./storage/uploads",
      STORAGE_PUBLIC_URL: "http://localhost:4000/uploads",
    },
  },
});
