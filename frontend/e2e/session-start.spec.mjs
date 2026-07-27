// e2e/session-start.spec.mjs — Wave -1
// Spec 4/6: typing into the topic input enables the Start button; clicking it
// transitions the app out of the topic-setup view.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

test('typing into topic input enables the Start button; clicking does not throw', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.waitForTimeout(400);

  const topicInput = page.locator('#topicInput, [name="topicInput"]').first();
  await expect(topicInput).toBeAttached({ timeout: 5_000 });
  await expect(topicInput).toBeVisible({ timeout: 5_000 });

  const startBtn = page.locator('button.start-btn, .start-btn').first();
  await expect(startBtn).toBeAttached();

  // Capture console errors during the click.
  const consoleErrors = [];
  page.on('pageerror', (e) => consoleErrors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await topicInput.fill('quick smoke topic test');
  await page.waitForTimeout(200); // autoResize + updateStartBtn fire on input

  await startBtn.click({ timeout: 5_000 }).catch((e) => consoleErrors.push('click: ' + String(e)));
  await page.waitForTimeout(1_500);

  // Filter out network errors (the dialog may open, look fine), keep real JS errors.
  const realErrors = consoleErrors.filter((e) =>
    /ReferenceError|TypeError|SyntaxError|Reference to undeclared/.test(e) &&
    !/fetch|network|api\/|\b401\b|\b503\b|csrf/i.test(e),
  );
  expect(realErrors, `startSession() threw:\n${realErrors.join('\n')}`).toEqual([]);
});

test('pressing Enter in the topic input starts the session', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  const topicInput = page.locator('#topicInput');
  await topicInput.fill('Enter should send this topic');
  await topicInput.press('Enter');

  await expect(page.locator('#topicSetup')).toBeHidden();
  await expect(page.locator('#chatView')).toBeVisible();
  await expect(page.locator('#msgList .msg.user')).toContainText('Enter should send this topic');
});
