import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Integration tests share one local database; run files one at a time.
    fileParallelism: false,
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 30_000,
  },
});
