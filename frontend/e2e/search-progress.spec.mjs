import { test, expect } from '@playwright/test';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('web search progress exposes elapsed time and keyboard-accessible details', async ({ page }) => {
  await mockAuthedApp(page);
  await page.goto('/');
  await waitForAppShell(page);

  await page.evaluate(async () => {
    const mount = document.createElement('div');
    mount.id = 'search-progress-test-mount';
    document.body.appendChild(mount);
    window.__searchProgressTest = window.__startSearchProgress('Socratic learning', { mount });
    window.__searchProgressTest.onStep({ kind: 'querying', data: { query: 'Socratic learning evidence' } });
    window.__searchProgressTest.onStep({ kind: 'got_results', data: { count: 4 } });
  });

  const root = page.locator('#search-progress-test-mount .search-progress');
  const head = root.locator('.search-progress-head');
  await expect(root).toHaveAttribute('aria-busy', 'true');
  await expect(head).toHaveAttribute('role', 'button');
  await head.focus();
  await page.keyboard.press('Enter');
  await expect(root).toHaveClass(/open/);
  await expect(head).toHaveAttribute('aria-expanded', 'true');
  await expect(root.locator('.search-progress-step')).toHaveCount(2);

  await page.waitForTimeout(1100);
  await expect(root.locator('.search-progress-elapsed')).not.toHaveText('0s');
  await page.evaluate(() => {
    window.__searchProgressTest.finalize({
      state: 'ok',
      finalCount: 4,
      engines: { bing: 3, web: 1 },
      fetchedCount: 2,
    });
  });
  await expect(root).toHaveAttribute('aria-busy', 'false');
  await expect(root.locator('.search-progress-title')).toContainText('4 sources');
  await expect(root.locator('.search-progress-elapsed')).toHaveText(/\d+\.\d+s/);
});
