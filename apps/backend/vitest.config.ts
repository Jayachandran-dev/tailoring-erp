import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: false,
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // We don't run integration tests that need a real DB in CI yet — they're
    // gated by VITEST_INTEGRATION=1. Keep the default suite hermetic.
    testTimeout: 10_000,
  },
});
