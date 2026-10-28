// End-to-end tests drive the app's web build against the local API and
// Supabase, signed in as the demo members from `npm run seed:demo`.
// See README.md in this folder for the one-time setup.
import { defineConfig, devices } from '@playwright/test';

const web = process.env.E2E_WEB_URL ?? 'http://127.0.0.1:8081';
const api = process.env.E2E_API_URL ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests',
  // The flows share one database, so they run one at a time, in file order.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 15_000 },
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './global-setup.ts',
  use: {
    baseURL: web,
    ...devices['Pixel 7'],
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    { command: 'npm run dev:api', cwd: '../..', url: `${api}/health`, reuseExistingServer: true, timeout: 60_000 },
    { command: 'node serve-web.mjs', url: web, reuseExistingServer: true },
  ],
});
