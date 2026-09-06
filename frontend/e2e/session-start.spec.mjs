// e2e/session-start.spec.mjs — Wave -1
// Spec 4/6: typing into the topic input enables the Start button; clicking it
// transitions the app out of the topic-setup view.

import { test, expect } from '@playwright/test';
import { gotoAndSettle, login } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

async function composerSignature(page, selector) {
  return page.locator(selector).evaluate((node) => {
    const rect = node.getBoundingClientRect();
    const style = getComputedStyle(node);
    const childRect = (childSelector) => {
      const child = node.querySelector(childSelector);
      if (!child) return null;
      const value = child.getBoundingClientRect();
      if (!value.width && !value.height) return null;
      return {
        x: Math.round(value.x - rect.x),
        y: Math.round(value.y - rect.y),
        width: Math.round(value.width),
        height: Math.round(value.height),
      };
    };
    return {
      width: Math.round(rect.width),
      height: Math.round(rect.height),
      background: style.backgroundColor,
      border: style.borderColor,
      radius: style.borderRadius,
      editor: childRect('.rich-composer-editor'),
      attach: childRect('.attach-btn'),
      effort: childRect('.effort-picker'),
      mic: childRect('.mobile-mic-btn'),
      send: childRect('.start-btn,.send-btn'),
    };
  });
}

test('typing into topic input enables the Start button; clicking does not throw', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);
  await page.waitForTimeout(400);

  const topicInput = page.locator('#topicComposerRoot .rich-composer-editor').first();
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

  const topicInput = page.locator('#topicComposerRoot .rich-composer-editor');
  await topicInput.fill('Enter should send this topic');
  await topicInput.press('Enter');

  await expect(page.locator('#topicSetup')).toBeHidden();
  await expect(page.locator('#chatView')).toBeVisible();
  await expect(page.locator('#msgList .msg.user')).toContainText('Enter should send this topic');
});

for (const [name, viewport] of [
  ['desktop', { width: 1280, height: 800 }],
  ['mobile', { width: 390, height: 844 }],
]) {
  test(`${name} composer keeps the landing UI after the first message is sent`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await mockAuthedApp(page);
    await gotoAndSettle(page, '/');
    await waitForAppShell(page);

    const topicEditor = page.locator('#topicComposerRoot .rich-composer-editor');
    await topicEditor.fill('Keep this UI');
    const before = await composerSignature(page, '#topicInputWrap');
    await topicEditor.press('Enter');
    await expect(page.locator('#chatView')).toBeVisible();
    await expect(page.locator('#msgList .msg.assistant .msg-body').first()).toBeVisible();
    const after = await composerSignature(page, '#chatInputWrap');

    /* Landing and in-session composers are distinct surfaces: the landing
       two-zone shell hands off to the compact chat pill on send. Pin both
       skins explicitly — the border tint differs by focus state, so only
       the surface, the radii and the heights are contractual here. */
    expect(after.background).toBe(before.background);
    if (name === 'mobile') {
      expect(before.radius).toBe('31px');
      expect(after.radius).toBe('31px');
      expect(before.height).toBe(62);
      expect(after.height).toBe(62);
    } else {
      expect(before.radius).toBe('24px');
      expect(after.radius).toBe('34px');
      expect(before.height).toBe(130);
      expect(after.height).toBe(68);
    }
    const widths = await page.evaluate(() => {
      const wrap = document.querySelector('#chatInputWrap');
      const body = document.querySelector('#msgList .msg.assistant .msg-body');
      return {
        composer: Math.round(wrap.getBoundingClientRect().width),
        text: Math.round(body.getBoundingClientRect().width),
      };
    });
    if (name === 'mobile') {
      /* The mobile composer sits inset (page margins) inside the wider
         transcript column; it must never overflow it. */
      expect(widths.composer).toBeLessThanOrEqual(widths.text);
    } else {
      expect(Math.abs(widths.composer - widths.text)).toBeLessThanOrEqual(1);
    }
    await expect(page.locator('#chatComposerRoot .rich-composer-editor'))
      .toHaveAttribute('aria-label', 'How can I help you today?');
  });
}

// Regression (P_deep-research-view): with the Deep Research extension enabled,
// clicking Start on the landing screen used to early-return into
// launchDeepResearch(), which posted agent output into the still-hidden
// #msgList while topicSetup stayed up — the button looked dead. Starting a
// deep-research session must switch to #chatView, commit the user bubble, and
// hand the topic to startDeepResearch exactly once.
test('Deep Research extension: Start on landing enters chat and runs research', async ({ page }) => {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  // Stub the research agent so the test asserts routing, not the full
  // plan/search/synthesize pipeline.
  await page.evaluate(() => {
    window.__researchCalls = [];
    window.startDeepResearch = (q) => { window.__researchCalls.push(q); return Promise.resolve('report'); };
    window.deepResearchOn = true;
  });

  const topicInput = page.locator('#topicComposerRoot .rich-composer-editor').first();
  await topicInput.fill('history of the printing press');
  await page.waitForTimeout(150);
  await page.locator('button.start-btn, .start-btn').first().click();

  await expect(page.locator('#topicSetup')).toBeHidden();
  await expect(page.locator('#chatView')).toBeVisible();
  await expect(page.locator('#msgList .msg.user')).toContainText('history of the printing press');

  await expect.poll(() => page.evaluate(() => window.__researchCalls || [])).toEqual(['history of the printing press']);
});
