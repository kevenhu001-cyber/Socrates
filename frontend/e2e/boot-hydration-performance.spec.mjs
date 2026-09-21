import { test, expect } from '@playwright/test';
import { mockAuthedApp } from './_mock-api.mjs';

test('the authenticated shell does not wait for delayed recents, providers, or memories', async ({ page }) => {
  await mockAuthedApp(page, { hydrationDelayMs: 1_500 });
  await page.goto('/', { waitUntil: 'commit' });

  await page.waitForFunction(() => document.documentElement.dataset.bootState === 'app');
  const shellState = await page.evaluate(() => ({
    shellMarked: performance.getEntriesByName('socrates:shell-visible').length > 0,
    providers: document.documentElement.dataset.providersState,
    memories: document.documentElement.dataset.memoriesState,
    sessions: document.documentElement.dataset.sessionsState,
    gateHidden: document.getElementById('authGate')?.classList.contains('hidden') === true,
  }));

  expect(shellState.shellMarked).toBe(true);
  expect(shellState.gateHidden).toBe(true);
  expect([shellState.providers, shellState.memories, shellState.sessions]).toContain('loading');

  await page.waitForFunction(() => {
    const root = document.documentElement.dataset;
    return root.providersState === 'ready'
      && root.memoriesState === 'ready'
      && root.sessionsState === 'ready';
  });
  expect(await page.evaluate(() => performance.getEntriesByName('socrates:hydration-complete').length)).toBe(1);
});
