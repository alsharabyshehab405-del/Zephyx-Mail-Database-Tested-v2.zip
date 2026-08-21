import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    testTimeout: 30_000,
    hookTimeout: 30_000,
    teardownTimeout: 15_000,
    reporters: ["verbose"],
    // Env vars applied BEFORE any module is imported, so rate-limiters read them correctly
    env: {
      NODE_ENV: "test",
      AUTH_RATE_LIMIT_MAX: "100",              // prevent accidental 429 during normal test auth calls
      AUTH_RATE_LIMIT_WINDOW_MS: "900000",     // 15 min
      EMAIL_ACTION_RATE_LIMIT_MAX: "100",      // allow email-action calls freely in tests
      EMAIL_ACTION_RATE_LIMIT_WINDOW_MS: "900000",
      PASSWORD_RESET_RATE_LIMIT_MAX: "100",
      PASSWORD_RESET_RATE_LIMIT_WINDOW_MS: "900000",
      LOG_LEVEL: "silent",                     // suppress pino output in test runs
    },
    // Run test files sequentially to avoid DB conflicts
    pool: "forks",
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
