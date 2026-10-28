import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one local database; run files one at a time.
    fileParallelism: false,
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 30_000,
    // `npm run coverage`: CI fails below these (docs/CODE_HEALTH.md).
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reporter: ['text-summary', 'json-summary', 'html'],
      thresholds: { lines: 80, statements: 80, functions: 80, branches: 70 },
    },
  },
});
