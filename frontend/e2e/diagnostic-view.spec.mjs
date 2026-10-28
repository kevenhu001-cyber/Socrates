// e2e/diagnostic-view.spec.mjs — the tutor diagnostic is a React view.
// The family's stylesheet was deleted in a dead-class sweep (2026-10-02), so
// this spec also pins the rendered card structure, not just the flow: failure
// card -> built-in questions -> answered questions -> results screen.
import { test, expect } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('diagnostic view: failure, built-in questions and results', async ({ page }) => {
  test.setTimeout(120000);
  await mockAuthedApp(page, { lang: 'en' });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.route('**/api/**', async (route) => {
    const url = route.request().url().replace('/api/v2/', '/api/');
    const method = route.request().method();
    if (url.includes('/api/auth/me')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ user: { id: 'u1', email: 't@t.com', verifiedAt: '2026-01-01' } }),
      });
      return;
    }
    if (url.includes('/api/config')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({}) });
      return;
    }
    if (url.includes('/api/sessions') && method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sessions: [], total: 0 }) });
      return;
    }
    if (url.includes('/api/projects')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ projects: [] }) });
      return;
    }
    await route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'no provider' }) });
  });

  await page.goto('/');
  await gotoAndSettle(page);
  await waitForAppShell(page);

  await page.locator('#composerRoot').click();
  await page.keyboard.type('Algebra');
  await page.evaluate(() => {
    window.setAppMode('tutor');
    document.body.dataset.appMode = 'tutor';
    document.querySelectorAll('.tutor-only').forEach((el) => { el.style.display = ''; });
    void window.startSession();
  });
  await page.getByRole('button', { name: 'Start exploration' }).click();

  const view = page.locator('#diagnosticView');

  // Generation fails without a provider: the failure card offers both exits.
  await expect(view.locator('.diag-error')).toBeVisible({ timeout: 30000 });
  await expect(view.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(view.getByRole('button', { name: 'Use built-in questions' })).toBeVisible();

  await view.getByRole('button', { name: 'Use built-in questions' }).click();

  // Question card: numbered prompt, option rows, disabled advance until answered.
  await expect(view.getByText('Question 1 of 5')).toBeVisible();
  await expect(view.locator('.diag-text')).not.toBeEmpty();
  const options = view.locator('[data-diag-command="select"]');
  await expect(options).toHaveCount(4);
  const next = view.locator('[data-diag-command="next"]');
  await expect(next).toBeDisabled();

  await options.first().click();
  await expect(options.first()).toHaveAttribute('aria-checked', 'true');
  await expect(next).toBeEnabled();

  for (let i = 0; i < 5; i++) {
    await view.locator('[data-diag-command="select"]').first().click();
    await view.locator('[data-diag-command="next"], [data-diag-command="finish"]').click();
    await page.waitForTimeout(120);
  }

  await expect(view.getByText('Diagnostic Results Interpretation')).toBeVisible();
  await expect(view.getByRole('button', { name: 'Start Systematic Learning' })).toBeVisible();
  await expect(view.getByText(/^Baseline: 5 dimension/)).toBeVisible();
});
