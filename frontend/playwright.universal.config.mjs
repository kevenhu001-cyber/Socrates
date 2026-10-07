import { defineConfig, devices } from '@playwright/test';

// Universal App gate (apps/socrates web export). Served by
// `npm run test:universal` on :4175 — a different port from the SPA
// mobile-composer server (:4174) so the two gates never collide.
export default defineConfig({
  testDir: './e2e',
  testMatch: 'universal-app.spec.mjs',
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? 'line' : 'list',
  use: {
    baseURL: process.env.UNIVERSAL_BASE_URL || 'http://127.0.0.1:4175',
    headless: true,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
});
