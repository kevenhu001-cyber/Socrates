import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const port = 4174;

export default defineConfig({
  testDir: './e2e',
  testMatch: ['mobile-composer-ux.spec.mjs'],
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    ...devices['Desktop Chrome'],
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 400, height: 890 },
    isMobile: true,
    hasTouch: true,
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
});
