// e2e/spring-motion.spec.mjs — the spring parameters, measured in the browser.
//
// The reaction pop is the one piece of motion whose *shape* is a product
// decision: stiffness 380 / damping 18 give a single overshoot of roughly
// 19% that settles back. An easing curve would look almost the same in a
// screenshot, so the number has to be measured rather than eyeballed —
// otherwise the next person to "simplify" it into a cubic-bezier loses the
// pop without anyone noticing.
//
// The drag spring (1200 / 80) is covered by e2e/sidebar-resize.spec.mjs:
// it is overdamped, so the thing worth pinning there is that the panel
// converges without ever passing its target.

import { expect, test } from '@playwright/test';
import { gotoAndSettle } from './_lib.mjs';
import { mockAuthedApp, waitForAppShell } from './_mock-api.mjs';

/* The peak the reaction spring is specified to reach: 19.5%, pinned at
   ±3 points so a small retune does not fail the build but a swap for an
   ease-out does. */
const PEAK_MIN = 1.16;
const PEAK_MAX = 1.22;

async function bootWithAssistantReply(page) {
  await mockAuthedApp(page);
  await gotoAndSettle(page, '/');
  await page.waitForLoadState('domcontentloaded');
  await waitForAppShell(page);

  await page.evaluate(() => {
    window.__testActivateMainView('chatView');
  });
  await page.evaluate(() => {
    window.stateStore.dispatch({ type: 'state/set', key: 'phase', value: 'chat' });
    window.stateStore.dispatch({ type: 'state/set', key: 'currentSessionId', value: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee' });
    window.stateStore.dispatch({ type: 'state/set', key: 'messages', value: [] });
    window.addMessage('assistant', 'A reply worth reacting to.');
  });

  const button = page.locator(
    '[data-client-id^="msg-"].msg.assistant button.msg-toolbar-btn[aria-label="Helpful"]',
  );
  await expect(button).toHaveCount(1);
  return button;
}

/* Start recording the icon's rendered scale every frame for `ms`. */
async function startScaleRecorder(page, ms) {
  await page.evaluate((duration) => {
    const button = document.querySelector(
      '[data-client-id^="msg-"].msg.assistant button.msg-toolbar-btn[aria-label="Helpful"]',
    );
    const icon = button?.querySelector('svg');
    window.__scaleSamples = [];
    window.__scaleDone = false;
    const started = performance.now();
    const sample = () => {
      const value = icon ? getComputedStyle(icon).scale : 'none';
      const parsed = value && value !== 'none' ? parseFloat(value) : 1;
      window.__scaleSamples.push(parsed);
      if (performance.now() - started < duration) requestAnimationFrame(sample);
      else window.__scaleDone = true;
    };
    requestAnimationFrame(sample);
  }, ms);
}

/* Read what the recorder collected, once it has finished collecting. */
async function readScaleSamples(page) {
  await page.waitForFunction(() => window.__scaleDone === true, null, { timeout: 10_000 });
  return page.evaluate(() => window.__scaleSamples || []);
}

test('the reaction button pops by about 19% and settles back', async ({ page }) => {
  const button = await bootWithAssistantReply(page);

  await startScaleRecorder(page, 700);
  await button.click();
  const samples = await readScaleSamples(page);

  const peak = Math.max(...samples);
  expect(peak, `the pop peaked at ${peak}`).toBeGreaterThan(PEAK_MIN);
  expect(peak, `the pop peaked at ${peak}`).toBeLessThan(PEAK_MAX);

  /* It has to come back: a pop that stops at the peak reads as a jump. */
  const tail = samples.slice(-5);
  for (const value of tail) expect(value).toBeCloseTo(1, 2);

  /* And the reaction acknowledges itself in the state, not only in motion. */
  await expect(button).toHaveClass(/active/);
});

test('reduced motion: the reaction button never scales', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const button = await bootWithAssistantReply(page);

  await startScaleRecorder(page, 500);
  await button.click();
  const samples = await readScaleSamples(page);

  for (const value of samples) {
    expect(value, 'the icon moved under reduced motion').toBeCloseTo(1, 3);
  }
  /* The state change still happens — only the motion is gone. */
  await expect(button).toHaveClass(/active/);
});
