// All three tiers share the production build and dist server.

import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = 4173;
const smoke =
  /(?:^|[/\\])(?:boot|storage-bootstrap|auth-direct-handlers|chat-send|chat-stop-resend|mount-recovery|sidebar-nav|share-view)\.spec\.mjs$/;
const visual = /(?:^|[/\\])(?:[^/\\]*-)?(?:visual|reference|palette)(?:-[^/\\]+)?\.spec\.mjs$/;
const theme =
  /(?:^|[/\\])(?:theme-system|theme-contrast|sidebar-light-theme|shadcn-theme)\.spec\.mjs$/;
const visualSpecs = [visual, theme];
const desktop = devices['Desktop Chrome'];
const ignoredSpecs = [
  '**/rn-web-smoke.spec.mjs',
  '**/tmp-*.spec.mjs',
  '**/probe-*.spec.mjs',
  '**/__probe*',
];

export default defineConfig({
  testDir: './e2e',
  // The RN Web smoke suite has its own exported bundle and Playwright config;
  // keeping it out of the SPA smoke suite prevents testing the wrong server.
  // One-off debug probes (tmp-*/probe-*) are gitignored scratch files: they
  // must never be counted by — or fail — the regression gate.
  testIgnore: ignoredSpecs,
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
  // Keep snapshot filenames stable across the project-name migration.
  snapshotPathTemplate:
    '{testDir}/{testFileDir}/{testFileName}-snapshots/{arg}-chromium-{platform}{ext}',
  projects: [
    { name: 'smoke', testMatch: smoke, use: desktop },
    { name: 'regression', testIgnore: [...ignoredSpecs, smoke, ...visualSpecs], use: desktop },
    { name: 'visual', testMatch: visualSpecs, use: desktop },
  ],
});
