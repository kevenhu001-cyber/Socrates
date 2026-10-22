// playwright.config.mjs — Wave -1 of main-js-split plan
// Boots ./e2e/dist-server.mjs (which serves dist/) and runs the 6 critical-path
// smoke specs in e2e/. Used as the single regression gate across every wave.

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = 4173;

export default defineConfig({
  testDir: './e2e',
  // The RN Web and Universal App suites have their own exported bundles and
  // Playwright configs. Keeping both out of the legacy SPA smoke suite
  // prevents the two app shells from being tested against the wrong server.
  // One-off debug probes (tmp-*/probe-*) are gitignored scratch files: they
  // must never be counted by — or fail — the regression gate.
  testIgnore: [
    '**/rn-web-smoke.spec.mjs',
    '**/universal-*.spec.mjs',
    '**/tmp-*.spec.mjs',
    '**/probe-*.spec.mjs',
    '**/__probe*',
  ],
  fullyParallel: false, // specs share global module state via the bundled main.js
  workers: 1,
  reporter: process.env.CI
    ? [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]]
    : [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'node ./e2e/dist-server.mjs',
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    cwd: __dirname,
    env: { SMOKE_PORT: String(port) },
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
